import { useMemo, useState } from 'react';
import type { Expense, Participant, SettlementCycle, SettlementPayment } from '../types';
import { formatDate, formatMovementDateGroup, movementDateKey } from '../lib/dates';
import { formatARS } from '../lib/money';
import { EmptyState } from './EmptyState';

type MovementFilter = 'all' | 'expenses' | 'payments' | 'cycles';

type MovementItem =
  | { type: 'expense'; date: string; sortDate: string; expense: Expense }
  | { type: 'payment'; date: string; sortDate: string; payment: SettlementPayment }
  | { type: 'cycle'; date: string; sortDate: string; cycle: SettlementCycle };

type GroupMovementsProps = {
  expenses: Expense[];
  settlementPayments: SettlementPayment[];
  settlementCycles: SettlementCycle[];
  participants: Participant[];
  onEditExpense: (expense: Expense) => void;
  onDeleteExpense: (expenseId: string) => void | Promise<void>;
  onVoidSettlementPayment?: (paymentId: string) => void | Promise<void>;
};

const filters: Array<{ id: MovementFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'expenses', label: 'Gastos' },
  { id: 'payments', label: 'Pagos' },
  { id: 'cycles', label: 'Cierres' }
];

export function GroupMovements({
  expenses,
  settlementPayments,
  settlementCycles,
  participants,
  onEditExpense,
  onDeleteExpense,
  onVoidSettlementPayment
}: GroupMovementsProps) {
  const [filter, setFilter] = useState<MovementFilter>('all');
  const [error, setError] = useState<string | null>(null);

  const movementGroups = useMemo(() => {
    const items: MovementItem[] = [
      ...expenses.map((expense) => ({ type: 'expense' as const, date: expense.date, sortDate: `${expense.date}T23:59:59`, expense })),
      ...settlementPayments.map((payment) => ({ type: 'payment' as const, date: payment.createdAt, sortDate: payment.createdAt, payment })),
      ...settlementCycles.map((cycle) => ({ type: 'cycle' as const, date: cycle.closedAt, sortDate: cycle.closedAt, cycle }))
    ].filter((item) => {
      if (filter === 'expenses') return item.type === 'expense';
      if (filter === 'payments') return item.type === 'payment';
      if (filter === 'cycles') return item.type === 'cycle';
      return true;
    });

    const sorted = items.sort((a, b) => b.sortDate.localeCompare(a.sortDate));
    const groups = new Map<string, MovementItem[]>();
    for (const item of sorted) {
      const key = movementDateKey(item.date);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }

    return Array.from(groups.entries()).map(([date, groupItems]) => ({ date, items: groupItems }));
  }, [expenses, filter, settlementCycles, settlementPayments]);

  async function handleDelete(expense: Expense) {
    const confirmed = window.confirm(`Eliminar el gasto "${expense.title}"?`);
    if (!confirmed) return;
    try {
      await onDeleteExpense(expense.id);
      setError(null);
    } catch {
      setError('No se pudo eliminar el gasto.');
    }
  }

  async function handleVoid(paymentId: string) {
    const confirmed = window.confirm('¿Queres anular este pago registrado?');
    if (!confirmed) return;
    try {
      await onVoidSettlementPayment?.(paymentId);
      setError(null);
    } catch {
      setError('No se pudo anular el pago.');
    }
  }

  function participantName(id: string): string {
    return participants.find((participant) => participant.id === id)?.name ?? 'Participante eliminado';
  }

  function participantAlias(id: string): string | undefined {
    return participants.find((participant) => participant.id === id)?.alias;
  }

  function payerText(expense: Expense): string {
    const payers = expense.payers?.length
      ? expense.payers
      : expense.paidByParticipantId
        ? [{ participantId: expense.paidByParticipantId, amountCents: expense.amountCents }]
        : [];

    if (payers.length === 0) return 'Sin pagador';
    if (payers.length === 1) return `Pago ${participantName(payers[0].participantId)}`;
    return `Pagaron ${payers.map((payer) => `${participantName(payer.participantId)} ${formatARS(payer.amountCents)}`).join(' y ')}`;
  }

  function emptyTitle(): string {
    if (filter === 'expenses') return 'Todavia no hay gastos.';
    if (filter === 'payments') return 'Todavia no hay pagos registrados.';
    if (filter === 'cycles') return 'Todavia no hay cierres.';
    return 'Todavia no hay movimientos.';
  }

  return (
    <section className="space-y-4">
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="flex min-w-max gap-2">
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`min-h-10 rounded-full border px-4 text-sm font-semibold ${
                filter === item.id
                  ? 'border-teal-700 bg-teal-700 text-white'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      {movementGroups.length === 0 ? (
        <EmptyState title={emptyTitle()} />
      ) : (
        <div className="space-y-5">
          {movementGroups.map((group) => (
            <div key={group.date} className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-500">{formatMovementDateGroup(group.date)}</h2>
              <div className="grid gap-2">
                {group.items.map((item) => {
                  if (item.type === 'expense') {
                    return (
                      <ExpenseMovementCard
                        key={`expense-${item.expense.id}`}
                        expense={item.expense}
                        payerText={payerText(item.expense)}
                        onEditExpense={onEditExpense}
                        onDeleteExpense={handleDelete}
                      />
                    );
                  }

                  if (item.type === 'payment') {
                    return (
                      <PaymentMovementCard
                        key={`payment-${item.payment.id}`}
                        payment={item.payment}
                        fromName={participantName(item.payment.fromParticipantId)}
                        toName={participantName(item.payment.toParticipantId)}
                        toAlias={participantAlias(item.payment.toParticipantId)}
                        onVoid={onVoidSettlementPayment ? handleVoid : undefined}
                      />
                    );
                  }

                  return (
                    <CycleMovementCard
                      key={`cycle-${item.cycle.id}`}
                      cycle={item.cycle}
                      closedExpenseCount={expenses.filter((expense) => expense.settlementCycleId === item.cycle.id).length}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ExpenseMovementCard({
  expense,
  payerText,
  onEditExpense,
  onDeleteExpense
}: {
  expense: Expense;
  payerText: string;
  onEditExpense: (expense: Expense) => void;
  onDeleteExpense: (expense: Expense) => void;
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">{formatDate(expense.date)}</p>
          <h3 className="mt-1 font-semibold text-slate-900">{expense.title}</h3>
        </div>
        <span className="font-semibold text-slate-900">{formatARS(expense.amountCents)}</span>
      </div>
      <div className="mt-2 space-y-1 text-sm text-slate-600">
        <p>{payerText}</p>
        <p>{(expense.splitMode ?? 'equal') === 'manual' ? 'Division manual' : 'Partes iguales'}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onEditExpense(expense)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
        >
          Editar
        </button>
        <button
          type="button"
          onClick={() => void onDeleteExpense(expense)}
          className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700"
        >
          Eliminar
        </button>
      </div>
    </article>
  );
}

function PaymentMovementCard({
  payment,
  fromName,
  toName,
  toAlias,
  onVoid
}: {
  payment: SettlementPayment;
  fromName: string;
  toName: string;
  toAlias?: string;
  onVoid?: (paymentId: string) => void;
}) {
  const isVoided = Boolean(payment.voidedAt);

  return (
    <article className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm ${isVoided ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">{new Date(payment.createdAt).toLocaleDateString('es-AR')}</p>
          <h3 className="mt-1 font-semibold text-slate-900">
            {fromName} le pago a {toName}
          </h3>
        </div>
        <span className="font-semibold text-slate-900">{formatARS(payment.amountCents)}</span>
      </div>
      {toAlias ? <p className="mt-2 text-sm text-slate-600">Alias de {toName}: {toAlias}</p> : null}
      {isVoided ? (
        <p className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">Pago anulado</p>
      ) : onVoid ? (
        <button
          type="button"
          onClick={() => onVoid(payment.id)}
          className="mt-3 rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700"
        >
          Anular
        </button>
      ) : null}
    </article>
  );
}

function CycleMovementCard({ cycle, closedExpenseCount }: { cycle: SettlementCycle; closedExpenseCount: number }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <h3 className="font-semibold text-slate-900">{cycle.title}</h3>
      <p className="mt-1 text-sm text-slate-500">
        {new Date(cycle.closedAt).toLocaleDateString('es-AR')}
        {closedExpenseCount > 0 ? ` · ${closedExpenseCount} gastos cerrados` : ''}
      </p>
    </article>
  );
}
