import type { Expense, Participant } from '../types';
import { formatDate } from '../lib/dates';
import { formatARS } from '../lib/money';
import { EmptyState } from './EmptyState';
import { useState } from 'react';

type ExpenseListProps = {
  expenses: Expense[];
  participants: Participant[];
  onEditExpense: (expense: Expense) => void;
  onDeleteExpense: (expenseId: string) => void | Promise<void>;
};

export function ExpenseList({ expenses, participants, onEditExpense, onDeleteExpense }: ExpenseListProps) {
  const [error, setError] = useState<string | null>(null);
  const sortedExpenses = [...expenses].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  function participantName(id: string): string {
    return participants.find((participant) => participant.id === id)?.name ?? 'Participante eliminado';
  }

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

  if (sortedExpenses.length === 0) {
    return <EmptyState title="Todavía no cargaste gastos." description="Agregá el primer gasto del grupo." />;
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
                <dt className="font-medium text-slate-700">Pagó</dt>
                <dd>{participantName(expense.paidByParticipantId)}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">Se divide entre</dt>
                <dd>{expense.splitParticipantIds.map(participantName).join(', ')}</dd>
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
                onClick={() => handleDelete(expense)}
                className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700"
              >
                Eliminar gasto
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
