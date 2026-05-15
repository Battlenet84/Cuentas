import { useState } from 'react';
import type { Expense, Participant } from '../types';
import { formatDate } from '../lib/dates';
import { formatARS } from '../lib/money';
import { EmptyState } from './EmptyState';
import { ConfirmDialog } from './ConfirmDialog';

type ExpenseListProps = {
  expenses: Expense[];
  participants: Participant[];
  onEditExpense: (expense: Expense) => void;
  onDeleteExpense: (expenseId: string) => void | Promise<void>;
};

export function ExpenseList({ expenses, participants, onEditExpense, onDeleteExpense }: ExpenseListProps) {
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);
  const sortedExpenses = [...expenses].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  function participantName(id: string): string {
    return participants.find((participant) => participant.id === id)?.name ?? 'Participante eliminado';
  }

  function payerText(expense: Expense): string {
    const payers = expense.payers?.length
      ? expense.payers
      : expense.paidByParticipantId
        ? [{ participantId: expense.paidByParticipantId, amountCents: expense.amountCents }]
        : [];

    if (payers.length === 0) return 'Sin pagador';
    if (payers.length === 1) return participantName(payers[0].participantId);
    return payers.map((payer) => `${participantName(payer.participantId)} ${formatARS(payer.amountCents)}`).join(' + ');
  }

  function splitText(expense: Expense): string {
    const splits = expense.splits?.length
      ? expense.splits
      : (expense.splitParticipantIds ?? []).map((participantId) => ({ participantId, amountCents: 0 }));

    if (splits.length === 0) return 'Sin division';
    if ((expense.splitMode ?? 'equal') === 'manual') {
      return splits.map((split) => `${participantName(split.participantId)} ${formatARS(split.amountCents)}`).join(' + ');
    }
    return `Partes iguales entre ${splits.map((split) => participantName(split.participantId)).join(', ')}`;
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await onDeleteExpense(pendingDelete.id);
      setPendingDelete(null);
      setError(null);
    } catch {
      setError('No se pudo eliminar el gasto.');
    }
  }

  if (sortedExpenses.length === 0) {
    return <EmptyState icon="receipt" title="Todavia no cargaste gastos" description="Agrega el primer gasto del grupo." />;
  }

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">Historial de gastos</h2>
      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <div className="grid gap-3">
        {sortedExpenses.map((expense) => (
          <article key={expense.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">{formatDate(expense.date)}</p>
                <h3 className="mt-1 font-semibold text-slate-900">{expense.title}</h3>
              </div>
              <span className="font-semibold text-slate-900">{formatARS(expense.amountCents)}</span>
            </div>
            <dl className="mt-3 grid gap-2 text-sm text-slate-600">
              <div>
                <dt className="font-medium text-slate-700">Pagado por</dt>
                <dd>{payerText(expense)}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">Division</dt>
                <dd>{splitText(expense)}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">Estado</dt>
                <dd>{expense.settlementCycleId ? 'Incluido en un cierre' : 'Abierto'}</dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onEditExpense(expense)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
              >
                Editar gasto
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(expense)}
                className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700"
              >
                Eliminar gasto
              </button>
            </div>
          </article>
        ))}
      </div>
      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        title="Eliminar gasto"
        description="Esta accion no se puede deshacer."
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}
