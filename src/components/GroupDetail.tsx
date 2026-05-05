import { useEffect, useMemo, useState } from 'react';
import type { ActivityLog, Expense, Group, GroupMembership, Participant, Settlement, SettlementCycle, SettlementPayment } from '../types';
import type { GroupMemberView } from '../data/supabaseStorage';
import type { RealtimeStatus } from '../data/realtime';
import {
  activeCurrencies,
  calculateBalancesByCurrency,
  calculatePendingSettlementCents,
  getOpenExpenses,
  getOpenSettlementPayments,
  simplifySettlementsByCurrency
} from '../lib/calculations';
import { formatCurrencyAmount, normalizeCurrency } from '../lib/money';
import { ExpenseForm } from './ExpenseForm';
import { ParticipantsManager } from './ParticipantsManager';
import { SettlementList } from './SettlementList';
import { IdentityCard } from './IdentityCard';
import { MembersManager } from './MembersManager';
import { EmptyState } from './EmptyState';
import { GroupBottomActionBar } from './GroupBottomActionBar';
import { GroupTabs, type GroupTab } from './GroupTabs';
import { GroupMovements } from './GroupMovements';
import { GroupProfileCard } from './GroupProfileCard';
import { Badge, Icon, MoneyDisplay, SectionHeader, SettingsBlock, SheetHandle } from './ui';

type GroupDetailProps = {
  group: Group;
  participants: Participant[];
  expenses: Expense[];
  settlementCycles: SettlementCycle[];
  settlementPayments: SettlementPayment[];
  activityLogs: ActivityLog[];
  profile?: import('../types').Profile | null;
  currentMembership?: GroupMembership | null;
  members?: GroupMemberView[];
  onBack: () => void;
  onSignOut?: () => void | Promise<void>;
  onAddParticipant: (name: string, alias?: string) => void | Promise<void>;
  onUpdateParticipant: (participant: Participant) => void | Promise<void>;
  onCreateExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => void | Promise<void>;
  onUpdateExpense: (expense: Expense) => void | Promise<void>;
  onDeleteExpense: (expenseId: string) => void | Promise<void>;
  onSettleDebt?: (settlement: Settlement) => void | Promise<void>;
  onVoidSettlementPayment?: (paymentId: string) => void | Promise<void>;
  onCloseOpenExpenses: () => void | Promise<void>;
  onRetry?: () => void | Promise<void>;
  onManualRefresh?: () => void | Promise<void>;
  onExpensePanelOpenChange?: (isOpen: boolean) => void;
  onChangeIdentity?: (participantId: string) => Promise<void>;
  onCreateIdentityParticipant?: (name: string, alias?: string) => Promise<void>;
  onRevokeMember?: (membershipId: string) => Promise<void>;
  onApproveMember?: (membershipId: string) => Promise<void>;
  onRejectMember?: (membershipId: string) => Promise<void>;
  onPromoteMember?: (membershipId: string) => Promise<void>;
  onDemoteOwner?: (membershipId: string) => Promise<void>;
  onRegenerateInvite?: () => Promise<void>;
  onUpdateMyGroupProfile?: (input: { participantName: string; participantAlias?: string; useProfileAlias: boolean }) => Promise<void>;
  errorMessage?: string | null;
  isSaving?: boolean;
  useSharedLink?: boolean;
  syncStatus?: RealtimeStatus;
};

export function GroupDetail({
  group,
  participants,
  expenses,
  settlementCycles,
  settlementPayments,
  activityLogs,
  profile,
  currentMembership,
  members = [],
  onBack,
  onSignOut,
  onAddParticipant,
  onUpdateParticipant,
  onCreateExpense,
  onUpdateExpense,
  onDeleteExpense,
  onSettleDebt,
  onVoidSettlementPayment,
  onCloseOpenExpenses,
  onRetry,
  onManualRefresh,
  onExpensePanelOpenChange,
  onChangeIdentity,
  onCreateIdentityParticipant,
  onRevokeMember,
  onApproveMember,
  onRejectMember,
  onPromoteMember,
  onDemoteOwner,
  onRegenerateInvite,
  onUpdateMyGroupProfile,
  errorMessage,
  isSaving = false,
  useSharedLink = false,
  syncStatus = 'idle'
}: GroupDetailProps) {
  const [activeTab, setActiveTab] = useState<GroupTab>('summary');
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [isExpensePanelOpen, setIsExpensePanelOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const groupParticipants = participants.filter((participant) => participant.groupId === group.id);
  const groupExpenses = expenses.filter((expense) => expense.groupId === group.id);
  const groupCycles = settlementCycles.filter((cycle) => cycle.groupId === group.id);
  const openSettlementPayments = getOpenSettlementPayments(settlementPayments.filter((payment) => payment.groupId === group.id));
  const isOwner = currentMembership?.role === 'owner' && currentMembership.status === 'active';
  const openExpenses = getOpenExpenses(groupExpenses);
  const currencies = useMemo(() => activeCurrencies(openExpenses, openSettlementPayments), [openExpenses, openSettlementPayments]);
  const totalOpenByCurrency = useMemo(
    () =>
      Object.fromEntries(
        currencies.map((currency) => [
          currency,
          openExpenses
            .filter((expense) => normalizeCurrency(expense.currency) === currency)
            .reduce((total, expense) => total + expense.amountCents, 0)
        ])
      ),
    [currencies, openExpenses]
  );

  const balancesByCurrency = useMemo(
    () => calculateBalancesByCurrency(group, groupParticipants, groupExpenses, openSettlementPayments),
    [group, groupParticipants, groupExpenses, openSettlementPayments]
  );
  const settlementsByCurrency = useMemo(() => simplifySettlementsByCurrency(balancesByCurrency), [balancesByCurrency]);
  const settlements = useMemo(() => Object.values(settlementsByCurrency).flat(), [settlementsByCurrency]);
  const pendingSettlementByCurrency = useMemo(
    () =>
      Object.fromEntries(
        currencies.map((currency) => [
          currency,
          calculatePendingSettlementCents(settlementsByCurrency[currency] ?? [])
        ])
      ),
    [currencies, settlementsByCurrency]
  );
  const pendingSettlementCents = settlements.reduce((total, settlement) => total + settlement.amountCents, 0);

  useEffect(() => {
    onExpensePanelOpenChange?.(isExpensePanelOpen);
  }, [isExpensePanelOpen, onExpensePanelOpenChange]);

  function participantName(id: string): string {
    return groupParticipants.find((participant) => participant.id === id)?.name ?? 'Participante';
  }

  function participantAlias(id: string): string | undefined {
    return groupParticipants.find((participant) => participant.id === id)?.alias;
  }

  function buildWhatsAppSummary(): string {
    const lines = [
      `Resumen de "${group.name}"`,
      '',
      'Para saldar:'
    ];

    if (settlements.length === 0) lines.push('Todo esta saldado.');
    else {
      for (const currency of currencies) {
        const currencySettlements = settlementsByCurrency[currency] ?? [];
        if (currencySettlements.length === 0) continue;
        lines.push('', `${currency}:`);
        for (const settlement of currencySettlements) {
          const alias = participantAlias(settlement.toParticipantId);
          const aliasText = alias ? ` — Alias: ${alias}` : '';
          lines.push(
            `- ${participantName(settlement.fromParticipantId)} le paga ${formatCurrencyAmount(settlement.amountCents, currency)} a ${participantName(
              settlement.toParticipantId
            )}${aliasText}`
          );
        }
      }
    }

    return lines.join('\n');
  }

  function buildGroupLink(): string {
    const origin = window.location.origin;
    if (useSharedLink && group.shareToken) return `${origin}/g/${group.shareToken}`;
    return `${origin}/group/${group.id}`;
  }

  function openCreateExpensePanel() {
    setEditingExpense(null);
    setIsExpensePanelOpen(true);
  }

  function openEditExpensePanel(expense: Expense) {
    setEditingExpense(expense);
    setIsExpensePanelOpen(true);
  }

  function closeExpensePanel() {
    setEditingExpense(null);
    setIsExpensePanelOpen(false);
  }

  async function handleCopySummary() {
    try {
      await navigator.clipboard.writeText(buildWhatsAppSummary());
      setCopyStatus('Resumen copiado.');
    } catch {
      setCopyStatus('No se pudo copiar el resumen.');
    }
  }

  async function handleCopyGroupLink() {
    try {
      await navigator.clipboard.writeText(buildGroupLink());
      setCopyStatus('Link del grupo copiado.');
    } catch {
      setCopyStatus('No se pudo copiar el link.');
    }
  }

  async function handleClose() {
    if (openExpenses.length === 0 || pendingSettlementCents > 0) return;
    const confirmed = window.confirm(
      'Esto va a archivar los gastos y pagos abiertos del periodo. Usalo solo si ya esta todo saldado.'
    );
    if (confirmed) await onCloseOpenExpenses();
  }

  async function handleRegenerateInvite() {
    const confirmed = window.confirm('Los links anteriores dejaran de servir para nuevas personas. Los miembros actuales mantienen acceso.');
    if (confirmed) await onRegenerateInvite?.();
  }

  async function handleVoidPayment(paymentId: string) {
    const confirmed = window.confirm('¿Queres anular este pago registrado?');
    if (confirmed) await onVoidSettlementPayment?.(paymentId);
  }

  const expenseForm = (
    <ExpenseForm
      groupId={group.id}
      participants={groupParticipants}
      expense={editingExpense}
      onCreateExpense={onCreateExpense}
      onUpdateExpense={onUpdateExpense}
      defaultPaidByParticipantId={currentMembership?.participantId ?? null}
      onCancel={isExpensePanelOpen ? closeExpensePanel : undefined}
    />
  );

  const identityCard =
    currentMembership && onChangeIdentity && onCreateIdentityParticipant ? (
      <IdentityCard
        membership={currentMembership}
        participants={groupParticipants}
        onChangeIdentity={onChangeIdentity}
        onCreateParticipant={onCreateIdentityParticipant}
      />
    ) : null;

  const membersManager =
    onRevokeMember ? (
      <MembersManager
        members={members}
        currentMembership={currentMembership ?? null}
        isOwner={isOwner}
        onRevokeMember={onRevokeMember}
        onApproveMember={onApproveMember}
        onRejectMember={onRejectMember}
        onPromoteMember={onPromoteMember}
        onDemoteOwner={onDemoteOwner}
      />
    ) : null;

  function renderTabContent() {
    if (activeTab === 'summary') {
      return (
        <div className="space-y-5">
          <section className="grid gap-3">
            {currencies.length === 0 ? (
              <div className="cc-card p-5">
                <Badge>ARS</Badge>
                <div className="mt-3">
                  <MoneyDisplay value={formatCurrencyAmount(0, 'ARS')} label="Total gastado" />
                </div>
                <p className="mt-3 text-sm text-slate-500">Todavia no hay gastos abiertos.</p>
              </div>
            ) : null}
            {currencies.map((currency) => (
              <div key={currency} className="cc-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <Badge tone="info">{currency}</Badge>
                  {(pendingSettlementByCurrency[currency] ?? 0) === 0 ? <Badge tone="success">Todo saldado</Badge> : <Badge tone="warning">Pendiente</Badge>}
                </div>
                <div className="mt-4">
                  <MoneyDisplay value={formatCurrencyAmount(totalOpenByCurrency[currency] ?? 0, currency)} label="Total gastado" />
                </div>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-100 p-3">
                  <p className="text-xs font-medium text-slate-500">Pendiente por saldar</p>
                  <p className="num mt-1 text-2xl font-semibold tracking-[-0.02em] text-slate-950">
                    {(pendingSettlementByCurrency[currency] ?? 0) > 0 ? formatCurrencyAmount(pendingSettlementByCurrency[currency] ?? 0, currency) : 'Todo saldado'}
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-[var(--cc-primary)]"
                      style={{ width: `${Math.min(100, Math.round(((pendingSettlementByCurrency[currency] ?? 0) / Math.max(totalOpenByCurrency[currency] ?? 1, 1)) * 100))}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </section>
          {openExpenses.length === 0 ? <EmptyState title="Todavia no hay gastos abiertos." /> : null}
          {settlements.length === 0 && openExpenses.length > 0 ? <EmptyState title="Todavia no hay deudas pendientes." /> : null}
          <SettlementList settlements={settlements} participants={groupParticipants} onSettle={onSettleDebt} />
          <button type="button" onClick={handleCopySummary} className="cc-button-secondary w-full">
            <Icon name="copy" size={15} /> Copiar resumen
          </button>
        </div>
      );
    }

    if (activeTab === 'movements') {
      return (
        <GroupMovements
          expenses={groupExpenses}
          settlementPayments={settlementPayments.filter((payment) => payment.groupId === group.id)}
          settlementCycles={groupCycles}
          activityLogs={activityLogs.filter((log) => log.groupId === group.id)}
          participants={groupParticipants}
          onEditExpense={openEditExpensePanel}
          onDeleteExpense={onDeleteExpense}
          onVoidSettlementPayment={onVoidSettlementPayment}
        />
      );
    }

    if (activeTab === 'people') {
      return (
        <div className="space-y-5">
          {identityCard}
          <ParticipantsManager
            groupId={group.id}
            participants={participants}
            expenses={expenses}
            onAddParticipant={onAddParticipant}
            onUpdateParticipant={onUpdateParticipant}
          />
          {membersManager}
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <GroupProfileCard
          membership={currentMembership ?? null}
          participants={groupParticipants}
          profile={profile ?? null}
          onSave={onUpdateMyGroupProfile}
        />
        <SettingsBlock title="Acceso al grupo" sub="Compartir link y aprobar ingresos.">
          <button
            type="button"
            onClick={handleCopyGroupLink}
            className="cc-row w-full justify-between text-left"
          >
            <span>Copiar link de invitacion</span>
            <Icon name="link" size={15} />
          </button>
          {isOwner && onRegenerateInvite ? (
            <button
              type="button"
              onClick={handleRegenerateInvite}
              className="cc-row w-full justify-between text-left"
            >
              <span>Regenerar link de invitacion</span>
              <Icon name="settings" size={15} />
            </button>
          ) : null}
          <div className="px-3 py-3 text-sm text-slate-600">
            Las personas con link deberan solicitar acceso. {isOwner ? 'Las solicitudes se aprueban desde Personas.' : ''}
          </div>
        </SettingsBlock>

        <SettingsBlock title="Gestion del periodo" sub="Cierre del periodo actual.">
          <div className="p-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={openExpenses.length === 0 || pendingSettlementCents > 0}
            className="cc-button-primary w-full disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Cerrar periodo
          </button>
          {pendingSettlementCents > 0 ? (
            <p className="cc-muted mt-3">Para cerrar el periodo, primero salda todas las deudas pendientes.</p>
          ) : null}
          </div>
        </SettingsBlock>

        <SettingsBlock title="Datos y mantenimiento" sub="Sincronizacion y navegacion.">
          {onManualRefresh ? (
            <button
              type="button"
              onClick={onManualRefresh}
              className="cc-row w-full justify-between text-left"
            >
              <span>Actualizar datos</span>
              <Icon name="settings" size={15} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onBack}
            className="cc-row w-full justify-between text-left"
          >
            <span>Volver a Mis grupos</span>
            <Icon name="arrow-r" size={15} />
          </button>
        </SettingsBlock>

        <SettingsBlock title="Cuenta">
          {onSignOut ? (
            <button
              type="button"
              onClick={onSignOut}
              className="cc-row w-full justify-between text-left"
            >
              <span>Cerrar sesion</span>
              <Icon name="user" size={15} />
            </button>
          ) : (
            <p className="p-3 text-sm text-slate-600">No hay acciones de cuenta en modo local.</p>
          )}
        </SettingsBlock>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28 md:pb-0">
      <div className="space-y-5">
        <header className="px-1 pt-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Grupo</p>
              <h1 className="serif mt-1 text-[1.7rem] font-semibold leading-tight tracking-[-0.025em] text-slate-950 md:text-3xl">{group.name}</h1>
              {syncStatus === 'error' ? <p className="mt-2 text-xs text-slate-500">No se pudo sincronizar.</p> : null}
            </div>
            <button type="button" onClick={handleCopyGroupLink} className="cc-button-secondary min-h-10 px-3 text-xs">
              <Icon name="link" size={14} /> Invitar
            </button>
          </div>
          <p className="mt-3 text-sm text-slate-600">
            {groupParticipants.length} personas · {settlements.length === 0 ? 'todo saldado' : `pendiente ${currencies.map((currency) => formatCurrencyAmount(pendingSettlementByCurrency[currency] ?? 0, currency)).join(' · ')}`}
          </p>
        </header>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <GroupTabs activeTab={activeTab} onTabChange={setActiveTab} />
          <button
            type="button"
            onClick={openCreateExpensePanel}
            className="cc-button-primary hidden md:inline-flex md:items-center"
          >
            Agregar gasto
          </button>
        </div>

        {copyStatus ? <p className="cc-banner cc-banner-success">{copyStatus}</p> : null}

        {errorMessage ? (
          <div className="cc-banner cc-banner-error">
            <p>{errorMessage}</p>
            {onRetry ? (
              <button type="button" onClick={onRetry} className="mt-2 font-semibold text-red-800 underline-offset-4 hover:underline">
                Reintentar
              </button>
            ) : null}
          </div>
        ) : null}

        {isSaving ? <p className="text-sm font-medium text-slate-600">Guardando cambios...</p> : null}

        <main>{renderTabContent()}</main>
      </div>

      <GroupBottomActionBar onAddExpense={openCreateExpensePanel} />

      {isExpensePanelOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 p-0 sm:items-center sm:justify-center sm:p-4">
          <div className="cc-bottom-sheet">
            <SheetHandle />
            {expenseForm}
          </div>
        </div>
      ) : null}
    </div>
  );
}
