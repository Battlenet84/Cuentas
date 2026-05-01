import type { Participant, Settlement } from '../types';
import { formatARS } from '../lib/money';

type SettlementListProps = {
  settlements: Settlement[];
  participants: Participant[];
};

export function SettlementList({ settlements, participants }: SettlementListProps) {
  function participantName(id: string): string {
    return participants.find((participant) => participant.id === id)?.name ?? 'Participante';
  }

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">Para saldar</h2>
      {settlements.length === 0 ? (
        <p className="rounded-lg border border-teal-100 bg-teal-50 p-4 text-sm font-medium text-teal-800">
          Todo está saldado.
        </p>
      ) : (
        <div className="grid gap-2">
          {settlements.map((settlement, index) => (
            <div key={`${settlement.fromParticipantId}-${settlement.toParticipantId}-${index}`} className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-sm text-slate-700">
                <span className="font-semibold">{participantName(settlement.fromParticipantId)}</span> le paga{' '}
                <span className="font-semibold">{formatARS(settlement.amountCents)}</span> a{' '}
                <span className="font-semibold">{participantName(settlement.toParticipantId)}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
