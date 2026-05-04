import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Expense, ExpensePayer, ExpenseSplit, Participant } from '../types';
import { todayInputValue } from '../lib/dates';
import { formatARS, parseARSInput } from '../lib/money';

type ExpenseFormProps = {
  groupId: string;
  participants: Participant[];
  expense?: Expense | null;
  defaultPaidByParticipantId?: string | null;
  onCreateExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => void | Promise<void>;
  onUpdateExpense?: (expense: Expense) => void | Promise<void>;
  onCancel?: () => void;
};

type AmountByParticipant = Record<string, string>;

export function ExpenseForm({
  groupId,
  participants,
  expense,
  defaultPaidByParticipantId,
  onCreateExpense,
  onUpdateExpense,
  onCancel
}: ExpenseFormProps) {
  const activeParticipants = useMemo(() => participants.filter((participant) => participant.isActive), [participants]);
  const availableParticipants = useMemo(
    () =>
      participants.filter(
        (participant) =>
          participant.isActive ||
          Boolean(expense?.payers?.some((payer) => payer.participantId === participant.id)) ||
          Boolean(expense?.splits?.some((split) => split.participantId === participant.id)) ||
          expense?.paidByParticipantId === participant.id ||
          Boolean(expense?.splitParticipantIds?.includes(participant.id))
      ),
    [expense, participants]
  );

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [payerMode, setPayerMode] = useState<'single' | 'multiple'>('single');
  const [splitMode, setSplitMode] = useState<'equal' | 'manual'>('equal');
  const [singlePayerId, setSinglePayerId] = useState('');
  const [payerAmounts, setPayerAmounts] = useState<AmountByParticipant>({});
  const [equalSplitIds, setEqualSplitIds] = useState<string[]>([]);
  const [splitAmounts, setSplitAmounts] = useState<AmountByParticipant>({});
  const [date, setDate] = useState(todayInputValue());
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const amountCents = parseARSInput(amount) ?? 0;
  const payerTotalCents = sumAmounts(payerAmounts);
  const splitTotalCents = sumAmounts(splitAmounts);

  useEffect(() => {
    if (!expense) {
      const defaultPayer = defaultPaidByParticipantId ?? activeParticipants[0]?.id ?? '';
      setTitle('');
      setAmount('');
      setPayerMode('single');
      setSplitMode('equal');
      setSinglePayerId(defaultPayer);
      setPayerAmounts({});
      setEqualSplitIds(activeParticipants.map((participant) => participant.id));
      setSplitAmounts({});
      setDate(todayInputValue());
      setError(null);
      return;
    }

    const resolvedPayers = getExpensePayers(expense);
    const resolvedSplits = getExpenseSplits(expense);
    const nextPayerMode = expense.payerMode ?? (resolvedPayers.length > 1 ? 'multiple' : 'single');
    const nextSplitMode = expense.splitMode ?? 'equal';

    setTitle(expense.title);
    setAmount(formatARS(expense.amountCents).replace('$', '').trim());
    setPayerMode(nextPayerMode);
    setSplitMode(nextSplitMode);
    setSinglePayerId(resolvedPayers[0]?.participantId ?? defaultPaidByParticipantId ?? '');
    setPayerAmounts(toAmountMap(resolvedPayers));
    setEqualSplitIds(resolvedSplits.filter((split) => split.amountCents > 0).map((split) => split.participantId));
    setSplitAmounts(toAmountMap(resolvedSplits));
    setDate(expense.date);
    setError(null);
  }, [activeParticipants, defaultPaidByParticipantId, expense]);

  function resetForm() {
    setTitle('');
    setAmount('');
    setPayerMode('single');
    setSplitMode('equal');
    setSinglePayerId(defaultPaidByParticipantId ?? activeParticipants[0]?.id ?? '');
    setPayerAmounts({});
    setEqualSplitIds(activeParticipants.map((participant) => participant.id));
    setSplitAmounts({});
    setDate(todayInputValue());
    setError(null);
  }

  function setParticipantAmount(
    setter: (value: AmountByParticipant | ((current: AmountByParticipant) => AmountByParticipant)) => void,
    participantId: string,
    value: string
  ) {
    setter((current) => ({ ...current, [participantId]: value }));
  }

  function toggleEqualSplit(participantId: string) {
    setEqualSplitIds((current) =>
      current.includes(participantId)
        ? current.filter((id) => id !== participantId)
        : [...current, participantId]
    );
  }

  function selectAllSplits() {
    setEqualSplitIds(availableParticipants.map((participant) => participant.id));
  }

  function clearSplits() {
    setEqualSplitIds([]);
  }

  function buildPayers(totalCents: number): ExpensePayer[] {
    if (payerMode === 'single') {
      if (!singlePayerId) return [];
      return [{ participantId: singlePayerId, amountCents: totalCents }];
    }

    return availableParticipants
      .map((participant) => ({
        participantId: participant.id,
        amountCents: parseARSInput(payerAmounts[participant.id] ?? '') ?? 0
      }))
      .filter((payer) => payer.amountCents > 0);
  }

  function buildSplits(totalCents: number): ExpenseSplit[] {
    if (splitMode === 'manual') {
      return availableParticipants
        .map((participant) => ({
          participantId: participant.id,
          amountCents: parseARSInput(splitAmounts[participant.id] ?? '') ?? 0
        }))
        .filter((split) => split.amountCents > 0);
    }

    return splitEqually(totalCents, equalSplitIds);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const totalCents = parseARSInput(amount);

    if (!title.trim()) {
      setError('Ingresa el nombre del gasto.');
      return;
    }

    if (!totalCents || totalCents <= 0) {
      setError('El monto tiene que ser mayor a 0.');
      return;
    }

    const payers = buildPayers(totalCents);
    const splits = buildSplits(totalCents);

    if (payers.length === 0) {
      setError('Elegi quien pago.');
      return;
    }

    if (splits.length === 0) {
      setError('Selecciona al menos un participante para dividir.');
      return;
    }

    if (payerMode === 'multiple' && payers.reduce((total, payer) => total + payer.amountCents, 0) !== totalCents) {
      setError('La suma pagada tiene que coincidir con el total.');
      return;
    }

    if (splitMode === 'manual' && splits.reduce((total, split) => total + split.amountCents, 0) !== totalCents) {
      setError('La suma de la division tiene que coincidir con el total.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        groupId,
        title: title.trim(),
        amountCents: totalCents,
        paidByParticipantId: payers[0].participantId,
        splitParticipantIds: splits.map((split) => split.participantId),
        payerMode,
        splitMode,
        payers,
        splits,
        date,
        settlementCycleId: expense?.settlementCycleId ?? null
      };

      if (expense && onUpdateExpense) {
        await onUpdateExpense({ ...expense, ...payload });
        onCancel?.();
        return;
      }

      await onCreateExpense(payload);
      resetForm();
      onCancel?.();
    } catch {
      setError('No se pudo guardar el gasto.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (activeParticipants.length === 0 && !expense) {
    return <p className="rounded-lg bg-white p-4 text-sm text-slate-500">Agrega participantes activos antes de cargar gastos.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold text-slate-900">{expense ? 'Editar gasto' : 'Agregar gasto'}</h2>
      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <section className="grid gap-3">
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
          Total
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="min-h-11 rounded-md border border-slate-300 px-3 text-base"
            inputMode="decimal"
            placeholder="12.500,00"
          />
        </label>

        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Fecha
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="min-h-11 rounded-md border border-slate-300 px-3 text-base"
          />
        </label>
      </section>

      <section className="grid gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Quien pago</p>
          <div className="mt-2 grid grid-cols-2 gap-2 rounded-md bg-slate-100 p-1">
            {(['single', 'multiple'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setPayerMode(mode)}
                className={`min-h-10 rounded px-3 text-sm font-semibold ${payerMode === mode ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'}`}
              >
                {mode === 'single' ? 'Una persona' : 'Varias personas'}
              </button>
            ))}
          </div>
        </div>

        {payerMode === 'single' ? (
          <select
            value={singlePayerId}
            onChange={(event) => setSinglePayerId(event.target.value)}
            className="min-h-11 rounded-md border border-slate-300 px-3 text-base"
          >
            <option value="">Seleccionar</option>
            {availableParticipants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participant.name}
              </option>
            ))}
          </select>
        ) : (
          <div className="grid gap-2">
            <p className="text-sm text-slate-600">Pagado: {formatARS(payerTotalCents)} de {formatARS(amountCents)}</p>
            {availableParticipants.map((participant) => (
              <MoneyRow
                key={participant.id}
                participant={participant}
                value={payerAmounts[participant.id] ?? ''}
                onChange={(value) => setParticipantAmount(setPayerAmounts, participant.id, value)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Como se divide</p>
          <div className="mt-2 grid grid-cols-2 gap-2 rounded-md bg-slate-100 p-1">
            {(['equal', 'manual'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSplitMode(mode)}
                className={`min-h-10 rounded px-3 text-sm font-semibold ${splitMode === mode ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'}`}
              >
                {mode === 'equal' ? 'Partes iguales' : 'Montos manuales'}
              </button>
            ))}
          </div>
        </div>

        {splitMode === 'equal' ? (
          <div className="grid gap-2">
            <div className="flex gap-2">
              <button type="button" onClick={selectAllSplits} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium">
                Seleccionar todo
              </button>
              <button type="button" onClick={clearSplits} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium">
                Deseleccionar todo
              </button>
            </div>
            {availableParticipants.map((participant) => (
              <label key={participant.id} className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm">
                <input
                  type="checkbox"
                  checked={equalSplitIds.includes(participant.id)}
                  onChange={() => toggleEqualSplit(participant.id)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                {participant.name}
                {!participant.isActive ? <span className="text-slate-400">(inactivo)</span> : null}
              </label>
            ))}
          </div>
        ) : (
          <div className="grid gap-2">
            <p className="text-sm text-slate-600">Asignado: {formatARS(splitTotalCents)} de {formatARS(amountCents)}</p>
            {availableParticipants.map((participant) => (
              <MoneyRow
                key={participant.id}
                participant={participant}
                value={splitAmounts[participant.id] ?? ''}
                onChange={(value) => setParticipantAmount(setSplitAmounts, participant.id, value)}
              />
            ))}
          </div>
        )}
      </section>

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

function MoneyRow({
  participant,
  value,
  onChange
}: {
  participant: Participant;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {participant.name}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 rounded-md border border-slate-300 px-3 text-base"
        inputMode="decimal"
        placeholder="0,00"
      />
    </label>
  );
}

function sumAmounts(values: AmountByParticipant): number {
  return Object.values(values).reduce((total, value) => total + (parseARSInput(value) ?? 0), 0);
}

function toAmountMap(items: Array<{ participantId: string; amountCents: number }>): AmountByParticipant {
  return Object.fromEntries(items.map((item) => [item.participantId, formatARS(item.amountCents).replace('$', '').trim()]));
}

function splitEqually(totalCents: number, participantIds: string[]): ExpenseSplit[] {
  if (participantIds.length === 0) return [];
  const baseShare = Math.floor(totalCents / participantIds.length);
  let remainder = totalCents - baseShare * participantIds.length;

  return participantIds.map((participantId) => {
    const extraCent = remainder > 0 ? 1 : 0;
    remainder -= extraCent;
    return { participantId, amountCents: baseShare + extraCent };
  });
}

function getExpensePayers(expense: Expense): ExpensePayer[] {
  if (expense.payers?.length) return expense.payers;
  if (!expense.paidByParticipantId) return [];
  return [{ participantId: expense.paidByParticipantId, amountCents: expense.amountCents }];
}

function getExpenseSplits(expense: Expense): ExpenseSplit[] {
  if (expense.splits?.length) return expense.splits;
  return splitEqually(expense.amountCents, expense.splitParticipantIds ?? []);
}
