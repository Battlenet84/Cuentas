import type { Participant, Settlement } from '../types';
import { formatARS } from '../lib/money';
import { useState } from 'react';

type SettlementListProps = {
  settlements: Settlement[];
  participants: Participant[];
  onSettle?: (settlement: Settlement) => void | Promise<void>;
};

export function SettlementList({ settlements, participants, onSettle }: SettlementListProps) {
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
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
    try {
      await onSettle?.(settlement);
      setError(null);
    } catch (error) {
      console.error('No se pudo registrar el pago.', error);
      setError('No se pudo registrar el pago.');
    }
  }

  async function copyText(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(message);
      setError(null);
    } catch {
      setError('No se pudo copiar.');
    }
  }

  function copyableAmount(amountCents: number): string {
    const amount = amountCents / 100;
    return Number.isInteger(amount)
      ? String(amount)
      : amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
  }

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">Para saldar</h2>
      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {copyStatus ? <p className="rounded-md bg-teal-50 p-3 text-sm text-teal-800">{copyStatus}</p> : null}
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
                  <div className="flex flex-wrap justify-end gap-2">
                    {receiver?.alias ? (
                      <button
                        type="button"
                        onClick={() => void copyText(receiver.alias ?? '', 'Alias copiado')}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
                      >
                        Copiar alias
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void copyText(copyableAmount(settlement.amountCents), 'Monto copiado')}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
                    >
                      Copiar monto
                    </button>
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
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
