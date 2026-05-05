import { useEffect, useMemo, useState } from 'react';
import type { ActivityLog, Expense, Group, GroupMembership, Participant, Settlement, SettlementCycle, SettlementPayment } from '../types';
import type { GroupMemberView } from '../data/supabaseStorage';
import type { RealtimeStatus } from '../data/realtime';
import {
  calculateBalances,
  calculatePendingSettlementCents,
  getOpenExpenses,
  getOpenSettlementPayments,
  simplifySettlements
} from '../lib/calculations';
import { formatARS } from '../lib/money';
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
  const totalOpenCents = openExpenses.reduce((total, expense) => total + expense.amountCents, 0);

  const balances = useMemo(
    () => calculateBalances(group, groupParticipants, groupExpenses, openSettlementPayments),
    [group, groupParticipants, groupExpenses, openSettlementPayments]
  );
  const settlements = useMemo(() => simplifySettlements(balances), [balances]);
  const pendingSettlementCents = useMemo(() => calculatePendingSettlementCents(settlements), [settlements]);

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
      `Total gastado: ${formatARS(totalOpenCents)}`,
      `Pendiente por saldar: ${formatARS(pendingSettlementCents)}`,
      '',
      'Para saldar:'
    ];

    if (settlements.length === 0) lines.push('Todo esta saldado.');
    else {
      for (const settlement of settlements) {
        const alias = participantAlias(settlement.toParticipantId);
        const aliasText = alias ? ` — Alias: ${alias}` : '';
        lines.push(
          `- ${participantName(settlement.fromParticipantId)} le paga ${formatARS(settlement.amountCents)} a ${participantName(
            settlement.toParticipantId
          )}${aliasText}`
        );
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
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="cc-card-soft">
              <p className="text-sm font-medium text-slate-500">Total gastado</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{formatARS(totalOpenCents)}</p>
            </div>
            <div className="cc-card-soft">
              <p className="text-sm font-medium text-slate-500">Pendiente por saldar</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">
                {pendingSettlementCents > 0 ? formatARS(pendingSettlementCents) : 'Todo saldado'}
              </p>
            </div>
          </section>
          {openExpenses.length === 0 ? <EmptyState title="Todavia no hay gastos abiertos." /> : null}
          {settlements.length === 0 && openExpenses.length > 0 ? <EmptyState title="Todavia no hay deudas pendientes." /> : null}
          <SettlementList settlements={settlements} participants={groupParticipants} onSettle={onSettleDebt} />
          <button
            type="button"
            onClick={handleCopySummary}
            className="cc-button-secondary w-full"
          >
            Copiar resumen
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
        <section className="cc-card grid gap-3">
          <h2 className="cc-section-title">Acceso al grupo</h2>
          <button
            type="button"
            onClick={handleCopyGroupLink}
            className="cc-button-secondary"
          >
            Copiar link de invitacion
          </button>
          {isOwner && onRegenerateInvite ? (
            <button
              type="button"
              onClick={handleRegenerateInvite}
              className="cc-button-secondary"
            >
              Regenerar link de invitacion
            </button>
          ) : null}
          <p className="cc-muted">Las personas con link deberan solicitar acceso.</p>
          {isOwner ? <p className="cc-muted">Las solicitudes se aprueban desde Personas.</p> : null}
        </section>

        <section className="cc-card grid gap-3">
          <h2 className="cc-section-title">Gestion del periodo</h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={openExpenses.length === 0 || pendingSettlementCents > 0}
            className="cc-button-primary disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Cerrar periodo
          </button>
          {pendingSettlementCents > 0 ? (
            <p className="cc-muted">Solo podes cerrar el periodo cuando el saldo este en cero.</p>
          ) : null}
        </section>

        <section className="cc-card grid gap-3">
          <h2 className="cc-section-title">Datos y mantenimiento</h2>
          {onManualRefresh ? (
            <button
              type="button"
              onClick={onManualRefresh}
              className="cc-button-secondary"
            >
              Actualizar datos
            </button>
          ) : null}
          <button
            type="button"
            onClick={onBack}
            className="cc-button-secondary"
          >
            Volver a Mis grupos
          </button>
        </section>

        <section className="cc-card grid gap-3">
          <h2 className="cc-section-title">Cuenta</h2>
          {onSignOut ? (
            <button
              type="button"
              onClick={onSignOut}
              className="cc-button-secondary"
            >
              Cerrar sesion
            </button>
          ) : (
            <p className="cc-muted">No hay acciones de cuenta en modo local.</p>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28 md:pb-0">
      <div className="space-y-5">
        <header className="rounded-2xl bg-slate-950 p-4 text-white shadow-lg shadow-slate-200 md:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-300">Grupo</p>
              <h1 className="mt-1 text-xl font-semibold md:text-2xl">{group.name}</h1>
              {syncStatus === 'error' ? <p className="mt-2 text-xs text-slate-300">No se pudo sincronizar.</p> : null}
            </div>
            <button type="button" onClick={handleCopyGroupLink} className="rounded-lg px-2 py-1 text-xs font-semibold text-teal-100 hover:bg-white/10">
              Copiar link
            </button>
          </div>
          <p className="mt-3 text-sm text-slate-200">
            Pendiente por saldar: {formatARS(pendingSettlementCents)}
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

        {copyStatus ? <p className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-800">{copyStatus}</p> : null}

        {errorMessage ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
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
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 shadow-xl sm:max-w-xl sm:rounded-2xl">
            {expenseForm}
          </div>
        </div>
      ) : null}
    </div>
  );
}
