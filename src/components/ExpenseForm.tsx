import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { CurrencyCode, Expense, ExpensePayer, ExpenseSplit, Participant } from '../types';
import { todayInputValue } from '../lib/dates';
import { formatARS, formatCurrencyAmount, normalizeCurrency, parseARSInput, supportedCurrencies } from '../lib/money';
import { buildPercentageSplits, parsePercentageInput, percentageSum } from '../lib/percentageSplits';
import { Avatar, Badge, Icon } from './ui';

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
type PercentageByParticipant = Record<string, string>;

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
  const [currency, setCurrency] = useState<CurrencyCode>('ARS');
  const [payerMode, setPayerMode] = useState<'single' | 'multiple'>('single');
  const [splitMode, setSplitMode] = useState<'equal' | 'manual' | 'percentage'>('equal');
  const [singlePayerId, setSinglePayerId] = useState('');
  const [payerAmounts, setPayerAmounts] = useState<AmountByParticipant>({});
  const [equalSplitIds, setEqualSplitIds] = useState<string[]>([]);
  const [splitAmounts, setSplitAmounts] = useState<AmountByParticipant>({});
  const [splitPercentages, setSplitPercentages] = useState<PercentageByParticipant>({});
  const [date, setDate] = useState(todayInputValue());
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const amountCents = parseARSInput(amount) ?? 0;
  const payerTotalCents = sumAmounts(payerAmounts);
  const splitTotalCents = sumAmounts(splitAmounts);
  const splitPercentageTotal = percentageSum(splitPercentages);
  const allActiveSplitIds = activeParticipants.map((participant) => participant.id);
  const areAllActiveSplitsSelected = allActiveSplitIds.length > 0 && allActiveSplitIds.every((id) => equalSplitIds.includes(id));
  const draftKey = expense?.id ?? 'new-expense';
  const initializedDraftKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (initializedDraftKeyRef.current === draftKey) return;
    initializedDraftKeyRef.current = draftKey;

    if (!expense) {
      const defaultPayer = defaultPaidByParticipantId ?? activeParticipants[0]?.id ?? '';
      setTitle('');
      setAmount('');
      setCurrency('ARS');
      setPayerMode('single');
      setSplitMode('equal');
      setSinglePayerId(defaultPayer);
      setPayerAmounts({});
      setEqualSplitIds(activeParticipants.map((participant) => participant.id));
      setSplitAmounts({});
      setSplitPercentages({});
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
    setCurrency(normalizeCurrency(expense.currency));
    setPayerMode(nextPayerMode);
    setSplitMode(nextSplitMode);
    setSinglePayerId(resolvedPayers[0]?.participantId ?? defaultPaidByParticipantId ?? '');
    setPayerAmounts(toAmountMap(resolvedPayers));
    setEqualSplitIds(resolvedSplits.filter((split) => split.amountCents > 0).map((split) => split.participantId));
    setSplitAmounts(toAmountMap(resolvedSplits));
    setSplitPercentages(toPercentageMap(resolvedSplits));
    setDate(expense.date);
    setError(null);
  }, [draftKey]);

  function resetForm() {
    setTitle('');
    setAmount('');
    setCurrency('ARS');
    setPayerMode('single');
    setSplitMode('equal');
    setSinglePayerId(defaultPaidByParticipantId ?? activeParticipants[0]?.id ?? '');
    setPayerAmounts({});
    setEqualSplitIds(activeParticipants.map((participant) => participant.id));
    setSplitAmounts({});
    setSplitPercentages({});
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
    if (areAllActiveSplitsSelected) {
      setEqualSplitIds([]);
      return;
    }
    setEqualSplitIds(allActiveSplitIds);
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

    if (splitMode === 'percentage') {
      return buildPercentageSplits(
        totalCents,
        availableParticipants.map((participant) => ({
          participantId: participant.id,
          percentage: parsePercentageInput(splitPercentages[participant.id] ?? '') ?? 0
        }))
      );
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
      setError('Selecciona al menos una persona que haya pagado.');
      return;
    }

    if (splits.length === 0) {
      setError('Selecciona al menos una persona para dividir.');
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

    if (splitMode === 'percentage' && Math.abs(splitPercentageTotal - 100) > 0.001) {
      setError('La suma de porcentajes tiene que ser 100%.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        groupId,
        title: title.trim(),
        amountCents: totalCents,
        currency,
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
    return <p className="cc-card text-sm text-slate-500">Agrega participantes activos antes de cargar gastos.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="serif text-2xl font-semibold tracking-[-0.02em] text-slate-950">{expense ? 'Editar gasto' : 'Nuevo gasto'}</h2>
          <p className="cc-muted mt-1">Carga el total, quien pago y como se reparte.</p>
        </div>
        <Badge tone={currency === 'ARS' ? 'info' : 'neutral'}>{currency}</Badge>
      </div>
      {error ? <p className="cc-banner cc-banner-error">{error}</p> : null}

      <section className="grid gap-3">
        <h3 className="cc-section-h">Datos del gasto</h3>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Que fue
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="cc-input"
            placeholder="Supermercado, cena, nafta"
          />
        </label>

        <div className="grid grid-cols-[1fr_104px] gap-2">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Total
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="cc-input num min-h-16 text-2xl font-semibold tracking-[-0.02em]"
              inputMode="decimal"
              placeholder="12.500,00"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Moneda
            <select value={currency} onChange={(event) => setCurrency(normalizeCurrency(event.target.value))} className="cc-input min-h-16">
              {supportedCurrencies.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Fecha
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="cc-input"
          />
        </label>
      </section>

      <section className="grid gap-3">
        <div>
          <p className="cc-section-h">Quien pago</p>
          <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-100 p-1">
            {(['single', 'multiple'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setPayerMode(mode)}
                className={`min-h-10 rounded-lg px-3 text-sm font-semibold transition ${payerMode === mode ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
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
            className="cc-input"
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
            <ProgressLine currentCents={payerTotalCents} totalCents={amountCents} currency={currency} label="Pagado" />
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
          <p className="cc-section-h">Como se divide</p>
          <div className="mt-2 grid gap-2 rounded-2xl border border-slate-200 bg-slate-100 p-1 sm:grid-cols-3">
            {(['equal', 'manual', 'percentage'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSplitMode(mode)}
                className={`min-h-10 rounded-lg px-3 text-sm font-semibold transition ${splitMode === mode ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {mode === 'equal' ? 'Partes iguales' : mode === 'manual' ? 'Montos manuales' : 'Por porcentaje'}
              </button>
            ))}
          </div>
        </div>

        {splitMode === 'equal' ? (
          <div className="grid gap-2">
            <div className="flex gap-2">
              <button type="button" onClick={selectAllSplits} className="cc-button-ghost">
                {areAllActiveSplitsSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
              </button>
            </div>
            {availableParticipants.map((participant) => (
              <label key={participant.id} className="cc-row rounded-xl border border-slate-200 bg-white text-sm first:border-t">
                <Avatar name={participant.name} size={28} />
                <input
                  type="checkbox"
                  checked={equalSplitIds.includes(participant.id)}
                  onChange={() => toggleEqualSplit(participant.id)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span className="font-medium text-slate-800">{participant.name}</span>
                {!participant.isActive ? <span className="text-slate-400">(inactivo)</span> : null}
              </label>
            ))}
          </div>
        ) : splitMode === 'manual' ? (
          <div className="grid gap-2">
            <ProgressLine currentCents={splitTotalCents} totalCents={amountCents} currency={currency} label="Asignado" />
            {availableParticipants.map((participant) => (
              <MoneyRow
                key={participant.id}
                participant={participant}
                value={splitAmounts[participant.id] ?? ''}
                onChange={(value) => setParticipantAmount(setSplitAmounts, participant.id, value)}
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-2">
            <PercentageProgress current={splitPercentageTotal} />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSplitPercentages(splitPercentagesEqually(availableParticipants.map((participant) => participant.id)))}
                className="cc-button-ghost"
              >
                Dividir en partes iguales
              </button>
              <button
                type="button"
                onClick={() => setSplitPercentages({})}
                className="cc-button-ghost"
              >
                Limpiar porcentajes
              </button>
            </div>
            {availableParticipants.map((participant) => {
              const percentage = parsePercentageInput(splitPercentages[participant.id] ?? '') ?? 0;
              const splitAmount = buildPercentageSplits(amountCents, [{ participantId: participant.id, percentage }])[0]?.amountCents ?? 0;
              return (
                <PercentageRow
                  key={participant.id}
                  participant={participant}
                  value={splitPercentages[participant.id] ?? ''}
                  amountCents={splitAmount}
                  currency={currency}
                  onChange={(value) => setParticipantAmount(setSplitPercentages, participant.id, value)}
                />
              );
            })}
          </div>
        )}
      </section>

      <section className="cc-card grid gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="cc-section-h">Resumen</h3>
            <p className="mt-1 text-sm text-slate-600">{amountCents > 0 ? formatCurrencyAmount(amountCents, currency) : 'Completa el total'} · {splitMode === 'equal' ? 'partes iguales' : splitMode === 'manual' ? 'montos manuales' : 'porcentaje'}</p>
          </div>
          <span className="cc-icon-tile"><Icon name="check" size={16} /></span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="cc-button-primary disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isSubmitting ? 'Guardando...' : expense ? 'Guardar cambios' : 'Guardar gasto'}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="cc-button-secondary"
          >
            Cancelar
          </button>
        ) : null}
        </div>
      </section>
    </form>
  );
}

function ProgressLine({ currentCents, totalCents, currency, label }: { currentCents: number; totalCents: number; currency: CurrencyCode; label: string }) {
  const difference = totalCents - currentCents;
  let detail = '';
  if (totalCents > 0 && difference > 0) detail = `Faltan ${formatCurrencyAmount(difference, currency)}`;
  if (totalCents > 0 && difference < 0) detail = `Te pasaste por ${formatCurrencyAmount(Math.abs(difference), currency)}`;
  if (totalCents > 0 && difference === 0) detail = 'La suma coincide.';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
      <div className="flex justify-between gap-3">
        <span>{label}</span>
        <span className="num font-semibold text-slate-800">{formatCurrencyAmount(currentCents, currency)} / {formatCurrencyAmount(totalCents, currency)}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-[var(--cc-primary)]" style={{ width: `${totalCents > 0 ? Math.min(100, Math.round((currentCents / totalCents) * 100)) : 0}%` }} />
      </div>
      {detail ? <p className="mt-1 font-medium text-slate-700">{detail}</p> : null}
    </div>
  );
}

function PercentageProgress({ current }: { current: number }) {
  const difference = 100 - current;
  let detail = 'La suma de porcentajes tiene que ser 100%.';
  if (difference > 0) detail = `Faltan ${formatPercentage(difference)}`;
  if (difference < 0) detail = `Te pasaste por ${formatPercentage(Math.abs(difference))}`;
  if (Math.abs(difference) < 0.001) detail = 'La suma coincide.';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
      <div className="flex justify-between gap-3">
        <span>Asignado</span>
        <span className="num font-semibold text-slate-800">{formatPercentage(current)} / 100%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-[var(--cc-primary)]" style={{ width: `${Math.min(100, Math.max(0, current))}%` }} />
      </div>
      <p className="mt-1 font-medium text-slate-700">{detail}</p>
    </div>
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
    <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
      <Avatar name={participant.name} size={28} />
      <span className="min-w-0 flex-1 truncate">{participant.name}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="cc-input num h-10 min-h-10 w-32 text-right"
        inputMode="decimal"
        placeholder="0,00"
      />
    </label>
  );
}

function PercentageRow({
  participant,
  value,
  amountCents,
  currency,
  onChange
}: {
  participant: Participant;
  value: string;
  amountCents: number;
  currency: CurrencyCode;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
      <Avatar name={participant.name} size={28} />
      <span className="min-w-0 flex-1 truncate">{participant.name}</span>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="cc-input num h-10 min-h-10 w-20 text-right"
          inputMode="decimal"
          placeholder="0"
        />
        <span className="w-24 text-right text-sm text-slate-500">{formatCurrencyAmount(amountCents, currency)}</span>
      </div>
    </label>
  );
}

function sumAmounts(values: AmountByParticipant): number {
  return Object.values(values).reduce((total, value) => total + (parseARSInput(value) ?? 0), 0);
}

function toAmountMap(items: Array<{ participantId: string; amountCents: number }>): AmountByParticipant {
  return Object.fromEntries(items.map((item) => [item.participantId, formatARS(item.amountCents).replace('$', '').trim()]));
}

function toPercentageMap(items: Array<{ participantId: string; percentage?: number | null }>): PercentageByParticipant {
  return Object.fromEntries(items.filter((item) => typeof item.percentage === 'number').map((item) => [item.participantId, String(item.percentage)]));
}

function splitPercentagesEqually(participantIds: string[]): PercentageByParticipant {
  if (participantIds.length === 0) return {};
  const base = Math.floor((10000 / participantIds.length)) / 100;
  let remaining = Math.round((100 - base * participantIds.length) * 100);
  return Object.fromEntries(
    participantIds.map((participantId) => {
      const extra = remaining > 0 ? 0.01 : 0;
      remaining -= extra ? 1 : 0;
      return [participantId, formatPercentage(base + extra).replace('%', '')];
    })
  );
}

function formatPercentage(value: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(value) + '%';
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
