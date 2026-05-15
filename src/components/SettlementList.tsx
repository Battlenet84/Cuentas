import type { Participant, Settlement } from '../types';
import { formatCurrencyAmount } from '../lib/money';
import { copyToClipboard } from '../lib/clipboard';
import { openMercadoPago } from '../lib/mercadoPago';
import { useState } from 'react';
import { Avatar, Icon, SectionHeader } from './ui';
import { ConfirmDialog } from './ConfirmDialog';

type SettlementListProps = {
  settlements: Settlement[];
  participants: Participant[];
  onSettle?: (settlement: Settlement) => void | Promise<void>;
};

export function SettlementList({ settlements, participants, onSettle }: SettlementListProps) {
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [pendingSettle, setPendingSettle] = useState<Settlement | null>(null);

  function participant(id: string): Participant | undefined {
    return participants.find((item) => item.id === id);
  }

  function participantName(id: string): string {
    return participant(id)?.name ?? 'Participante';
  }

  async function confirmSettle() {
    if (!pendingSettle) return;
    try {
      await onSettle?.(pendingSettle);
      setPendingSettle(null);
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
      <SectionHeader title="Para saldar" sub="Cada deuda muestra quien paga, quien recibe y las acciones utiles." />
      {error ? <p className="cc-banner cc-banner-error">{error}</p> : null}
      {copyStatus ? <p className="cc-banner cc-banner-success">{copyStatus}</p> : null}
      {settlements.length === 0 ? (
        <div className="cc-card flex items-center gap-3 border-[var(--cc-positive-soft)] bg-[var(--cc-positive-soft)]">
          <span className="cc-icon-tile bg-white/60 text-[var(--cc-positive)]"><Icon name="check" size={18} /></span>
          <div>
            <p className="font-semibold text-slate-950">Todo saldado</p>
            <p className="text-sm text-slate-700">No hay deudas pendientes en este periodo.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {settlements.map((settlement, index) => {
            const receiver = participant(settlement.toParticipantId);
            const fromName = participantName(settlement.fromParticipantId);
            const toName = participantName(settlement.toParticipantId);
            return (
              <div
                key={`${settlement.fromParticipantId}-${settlement.toParticipantId}-${index}`}
                className="cc-card p-4"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={fromName} size={34} />
                  <Icon name="arrow-r" size={14} className="text-slate-400" />
                  <Avatar name={toName} size={34} />
                  <div className="min-w-0 flex-1" />
                  <p className="num text-lg font-semibold tracking-[-0.01em] text-slate-950">
                    {formatCurrencyAmount(settlement.amountCents, settlement.currency)}
                  </p>
                </div>
                <div className="mt-3">
                  <p className="text-sm leading-6 text-slate-700">
                    <span className="font-semibold">{fromName}</span> le paga a <span className="font-semibold">{toName}</span>
                  </p>
                  {receiver?.alias ? (
                    <p className="mt-0.5 text-xs font-medium text-slate-500">Alias: {receiver.alias}</p>
                  ) : (
                    <p className="mt-0.5 text-xs font-medium text-slate-500">Sin alias cargado</p>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {receiver?.alias ? (
                    <button
                      type="button"
                      onClick={() => void copyText(receiver.alias ?? '', 'Alias copiado')}
                      className="cc-button-secondary min-h-9 px-3 text-xs"
                    >
                      <Icon name="copy" size={13} /> Alias
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void copyText(copyableAmount(settlement.amountCents), 'Monto copiado')}
                    className="cc-button-secondary min-h-9 px-3 text-xs"
                  >
                    <Icon name="copy" size={13} /> Monto
                  </button>
                  {receiver?.alias ? (
                    <button
                      type="button"
                      onClick={() => void handleOpenMercadoPago(receiver.alias ?? '')}
                      className="cc-button-secondary min-h-9 px-3 text-xs"
                    >
                      <Icon name="wallet" size={13} /> Mercado Pago
                    </button>
                  ) : null}
                  {onSettle ? (
                    <button
                      type="button"
                        onClick={() => setPendingSettle(settlement)}
                      className="cc-button-primary ml-auto min-h-9 px-3 text-xs"
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
      <ConfirmDialog
        isOpen={Boolean(pendingSettle)}
        title="Confirmar pago"
        description={
          pendingSettle
            ? `Confirmas que ${participantName(pendingSettle.fromParticipantId)} le pago ${formatCurrencyAmount(pendingSettle.amountCents, pendingSettle.currency)} a ${participantName(pendingSettle.toParticipantId)}?`
            : ''
        }
        confirmLabel="Si, saldar"
        onConfirm={confirmSettle}
        onCancel={() => setPendingSettle(null)}
      />
    </section>
  );
}
