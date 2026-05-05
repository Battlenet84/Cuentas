import type { Participant, Settlement } from '../types';
import { formatCurrencyAmount } from '../lib/money';
import { copyToClipboard } from '../lib/clipboard';
import { openMercadoPago } from '../lib/mercadoPago';
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
    const confirmed = window.confirm(`Confirmas que ${from} le pago ${formatCurrencyAmount(settlement.amountCents, settlement.currency)} a ${to}?`);
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
      const copied = await copyToClipboard(text);
      if (!copied) throw new Error('copy failed');
      setCopyStatus(message);
      setError(null);
    } catch {
      setError('No se pudo copiar.');
    }
  }

  async function handleOpenMercadoPago(alias: string) {
    const copied = await copyToClipboard(alias);
    if (!copied) {
      setError('No se pudo copiar el alias.');
      return;
    }

    setCopyStatus('Alias copiado. Pegalo en Mercado Pago.');
    setError(null);
    const opened = openMercadoPago();
    if (!opened) setError('No pudimos abrir Mercado Pago. Abrilo manualmente y pega el alias copiado.');
  }

  function copyableAmount(amountCents: number): string {
    const amount = amountCents / 100;
    return Number.isInteger(amount)
      ? String(amount)
      : amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
  }

  return (
    <section className="space-y-3">
      <h2 className="cc-section-title">Para saldar</h2>
      {error ? <p className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {copyStatus ? <p className="rounded-xl border border-teal-100 bg-teal-50 p-3 text-sm text-teal-800">{copyStatus}</p> : null}
      {settlements.length === 0 ? (
        <p className="rounded-xl border border-teal-100 bg-teal-50 p-4 text-sm font-semibold text-teal-800">
          Todo esta saldado.
        </p>
      ) : (
        <div className="grid gap-2">
          {settlements.map((settlement, index) => {
            const receiver = participant(settlement.toParticipantId);
            return (
              <div
                key={`${settlement.fromParticipantId}-${settlement.toParticipantId}-${index}`}
                className="cc-card-soft"
              >
                <div className="grid gap-3 sm:flex sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm leading-6 text-slate-700">
                      <span className="font-semibold">{participantName(settlement.fromParticipantId)}</span> le paga{' '}
                      <span className="font-semibold">{formatCurrencyAmount(settlement.amountCents, settlement.currency)}</span> a{' '}
                      <span className="font-semibold">{participantName(settlement.toParticipantId)}</span>
                    </p>
                    {receiver?.alias ? (
                      <p className="mt-1 text-xs font-medium text-slate-500">Alias de {receiver.name}: {receiver.alias}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    {receiver?.alias ? (
                      <button
                        type="button"
                        onClick={() => void copyText(receiver.alias ?? '', 'Alias copiado')}
                        className="cc-button-ghost"
                      >
                        Copiar alias
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void copyText(copyableAmount(settlement.amountCents), 'Monto copiado')}
                      className="cc-button-ghost"
                    >
                      Copiar monto
                    </button>
                    {receiver?.alias ? (
                      <button
                        type="button"
                        onClick={() => void handleOpenMercadoPago(receiver.alias ?? '')}
                        className="cc-button-secondary"
                      >
                        Abrir Mercado Pago
                      </button>
                    ) : null}
                    {onSettle ? (
                      <button
                        type="button"
                        onClick={() => void handleSettle(settlement)}
                        className="cc-button-secondary border-teal-200 text-teal-800"
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
