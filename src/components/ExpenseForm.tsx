import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Expense, Participant } from '../types';
import { todayInputValue } from '../lib/dates';
import { formatARS, parseARSInput } from '../lib/money';

type ExpenseFormProps = {
  groupId: string;
  participants: Participant[];
  expense?: Expense | null;
  onCreateExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => void | Promise<void>;
  onUpdateExpense?: (expense: Expense) => void | Promise<void>;
  onCancel?: () => void;
};

export function ExpenseForm({
  groupId,
  participants,
  expense,
  onCreateExpense,
  onUpdateExpense,
  onCancel
}: ExpenseFormProps) {
  const activeParticipants = useMemo(() => participants.filter((participant) => participant.isActive), [participants]);
  const payerOptions = useMemo(
    () =>
      participants.filter(
        (participant) => participant.isActive || (expense ? participant.id === expense.paidByParticipantId : false)
      ),
    [expense, participants]
  );
  const splitOptions = useMemo(
    () =>
      participants.filter(
        (participant) => participant.isActive || (expense ? expense.splitParticipantIds.includes(participant.id) : false)
      ),
    [expense, participants]
  );

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [paidByParticipantId, setPaidByParticipantId] = useState('');
  const [splitParticipantIds, setSplitParticipantIds] = useState<string[]>([]);
  const [date, setDate] = useState(todayInputValue());
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!expense) {
      setTitle('');
      setAmount('');
      setPaidByParticipantId('');
      setSplitParticipantIds([]);
      setDate(todayInputValue());
      setError(null);
      return;
    }

    setTitle(expense.title);
    setAmount(formatARS(expense.amountCents).replace('$', '').trim());
    setPaidByParticipantId(expense.paidByParticipantId);
    setSplitParticipantIds(expense.splitParticipantIds);
    setDate(expense.date);
    setError(null);
  }, [expense]);

  function resetForm() {
    setTitle('');
    setAmount('');
    setPaidByParticipantId('');
    setSplitParticipantIds([]);
    setDate(todayInputValue());
    setError(null);
  }

  function toggleSplitParticipant(participantId: string) {
    setSplitParticipantIds((current) =>
      current.includes(participantId)
        ? current.filter((id) => id !== participantId)
        : [...current, participantId]
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountCents = parseARSInput(amount);

    if (!title.trim()) {
      setError('Ingresá el nombre del gasto.');
      return;
    }

    if (!amountCents || amountCents <= 0) {
      setError('El monto tiene que ser mayor a 0.');
      return;
    }

    if (!payerOptions.some((participant) => participant.id === paidByParticipantId)) {
      setError('Elegí quién pagó.');
      return;
    }

    if (splitParticipantIds.length === 0) {
      setError('Seleccioná al menos un participante para dividir.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (expense && onUpdateExpense) {
        await onUpdateExpense({
          ...expense,
          title: title.trim(),
          amountCents,
          paidByParticipantId,
          splitParticipantIds,
          date
        });
        onCancel?.();
        return;
      }

      await onCreateExpense({
        groupId,
        title: title.trim(),
        amountCents,
        paidByParticipantId,
        splitParticipantIds,
        date,
        settlementCycleId: null
      });

      resetForm();
      onCancel?.();
    } catch {
      setError(expense ? 'No se pudo guardar el gasto.' : 'No se pudo guardar el gasto.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (activeParticipants.length === 0 && !expense) {
    return <p className="rounded-lg bg-white p-4 text-sm text-slate-500">Agregá participantes activos antes de cargar gastos.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold text-slate-900">{expense ? 'Editar gasto' : 'Agregar gasto'}</h2>
      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Nombre del gasto
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="min-h-11 rounded-md border border-slate-300 px-3 text-base"
          placeholder="Supermercado, cena, nafta"
        />
      </label>

      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Monto en pesos argentinos
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="min-h-11 rounded-md border border-slate-300 px-3 text-base"
          inputMode="decimal"
          placeholder="12.500,00"
        />
      </label>

      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Quién pagó
        <select
          value={paidByParticipantId}
          onChange={(event) => setPaidByParticipantId(event.target.value)}
          className="min-h-11 rounded-md border border-slate-300 px-3 text-base"
        >
          <option value="">Seleccionar</option>
          {payerOptions.map((participant) => (
            <option key={participant.id} value={participant.id}>
              {participant.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium text-slate-700">Entre quiénes se divide</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {splitOptions.map((participant) => (
            <label
              key={participant.id}
              className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm"
            >
              <input
                type="checkbox"
                checked={splitParticipantIds.includes(participant.id)}
                onChange={() => toggleSplitParticipant(participant.id)}
                className="h-4 w-4 rounded border-slate-300"
              />
              {participant.name}
              {!participant.isActive ? <span className="text-slate-400">(inactivo)</span> : null}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Fecha
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="min-h-11 rounded-md border border-slate-300 px-3 text-base"
        />
      </label>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="min-h-11 rounded-md bg-teal-700 px-4 font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isSubmitting ? 'Guardando...' : expense ? 'Guardar cambios' : 'Guardar gasto'}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-md border border-slate-300 bg-white px-4 font-medium text-slate-800"
          >
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}
