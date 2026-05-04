import type { Participant, Settlement } from '../types';
import { formatARS } from '../lib/money';

type SettlementListProps = {
  settlements: Settlement[];
  participants: Participant[];
  onSettle?: (settlement: Settlement) => void | Promise<void>;
};

export function SettlementList({ settlements, participants, onSettle }: SettlementListProps) {
  function participant(id: string): Participant | undefined {
    return participants.find((item) => item.id === id);
  }

  function participantName(id: string): string {
    return participant(id)?.name ?? 'Participante';
  }

  async function handleSettle(settlement: Settlement) {
    const from = participantName(settlement.fromParticipantId);
    const to = participantName(settlement.toParticipantId);
    const confirmed = window.confirm(`Confirmas que ${from} le pago ${formatARS(settlement.amountCents)} a ${to}?`);
    if (!confirmed) return;
    await onSettle?.(settlement);
  }

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">Para saldar</h2>
      {settlements.length === 0 ? (
        <p className="rounded-lg border border-teal-100 bg-teal-50 p-4 text-sm font-medium text-teal-800">
          Todo esta saldado.
        </p>
      ) : (
        <div className="grid gap-2">
          {settlements.map((settlement, index) => {
            const receiver = participant(settlement.toParticipantId);
            return (
              <div
                key={`${settlement.fromParticipantId}-${settlement.toParticipantId}-${index}`}
                className="rounded-lg border border-slate-200 bg-white p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-700">
                      <span className="font-semibold">{participantName(settlement.fromParticipantId)}</span> le paga{' '}
                      <span className="font-semibold">{formatARS(settlement.amountCents)}</span> a{' '}
                      <span className="font-semibold">{participantName(settlement.toParticipantId)}</span>
                    </p>
                    {receiver?.alias ? (
                      <p className="mt-1 text-xs font-medium text-slate-500">Alias de {receiver.name}: {receiver.alias}</p>
                    ) : null}
                  </div>
                  {onSettle ? (
                    <button
                      type="button"
                      onClick={() => void handleSettle(settlement)}
                      className="rounded-md border border-teal-200 px-3 py-2 text-sm font-semibold text-teal-800"
                    >
                      Saldar
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
