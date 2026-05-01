import type { Expense, SettlementCycle } from '../types';
import { formatDateTime } from '../lib/dates';

type SettlementCyclesListProps = {
  cycles: SettlementCycle[];
  expenses: Expense[];
};

export function SettlementCyclesList({ cycles, expenses }: SettlementCyclesListProps) {
  if (cycles.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Cierres anteriores</h2>
        <p className="rounded-lg bg-white p-4 text-sm text-slate-500">Todavía no hay cierres.</p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">Cierres anteriores</h2>
      <div className="grid gap-2">
        {cycles.map((cycle) => {
          const closedExpenseCount = expenses.filter((expense) => expense.settlementCycleId === cycle.id).length;
          return (
            <div key={cycle.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="font-medium text-slate-900">{cycle.title}</p>
              <p className="text-sm text-slate-500">
                {formatDateTime(cycle.closedAt)} · {closedExpenseCount} gastos cerrados
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
