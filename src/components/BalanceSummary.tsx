import type { Balance, Participant } from '../types';
import { formatARS } from '../lib/money';

type BalanceSummaryProps = {
  balances: Balance[];
  participants: Participant[];
};

export function BalanceSummary({ balances, participants }: BalanceSummaryProps) {
  function participantName(id: string): string {
    return participants.find((participant) => participant.id === id)?.name ?? 'Participante';
  }

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">Balance actual</h2>
      {balances.length === 0 ? (
        <p className="rounded-lg bg-white p-4 text-sm text-slate-500">Sin participantes para calcular balance.</p>
      ) : (
        <div className="grid gap-2">
          {balances.map((balance) => (
            <div
              key={balance.participantId}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3"
            >
              <div>
                <p className="font-medium text-slate-900">{participantName(balance.participantId)}</p>
                <p className="text-sm text-slate-500">
                  Pagó {formatARS(balance.paidCents)} · Le correspondía {formatARS(balance.owedCents)}
                </p>
              </div>
              <span
                className={`font-semibold ${
                  balance.balanceCents > 0
                    ? 'text-teal-700'
                    : balance.balanceCents < 0
                      ? 'text-red-700'
                      : 'text-slate-600'
                }`}
              >
                {formatARS(balance.balanceCents)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
