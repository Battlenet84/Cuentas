import { useEffect, useMemo, useState } from 'react';
import type { Expense, Group, GroupMembership, Participant, Settlement, SettlementCycle, SettlementPayment } from '../types';
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
import { ExpenseList } from './ExpenseList';
import { ParticipantsManager } from './ParticipantsManager';
import { SettlementCyclesList } from './SettlementCyclesList';
import { SettlementList } from './SettlementList';
import { IdentityCard } from './IdentityCard';
import { MembersManager } from './MembersManager';
import { EmptyState } from './EmptyState';
import { GroupBottomActionBar } from './GroupBottomActionBar';
import { GroupTabs, type GroupTab } from './GroupTabs';

type GroupDetailProps = {
  group: Group;
  participants: Participant[];
  expenses: Expense[];
  settlementCycles: SettlementCycle[];
  settlementPayments: SettlementPayment[];
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
  onRegenerateInvite?: () => Promise<void>;
  errorMessage?: string | null;
  isSaving?: boolean;
  useSharedLink?: boolean;
  syncStatus?: RealtimeStatus;
  lastSyncAt?: string | null;
};

export function GroupDetail({
  group,
  participants,
  expenses,
  settlementCycles,
  settlementPayments,
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
  onRegenerateInvite,
  errorMessage,
  isSaving = false,
  useSharedLink = false,
  syncStatus = 'idle',
  lastSyncAt
}: GroupDetailProps) {
  const [activeTab, setActiveTab] = useState<GroupTab>('summary');
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [isExpensePanelOpen, setIsExpensePanelOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const groupParticipants = participants.filter((participant) => participant.groupId === group.id);
  const groupExpenses = expenses.filter((expense) => expense.groupId === group.id);
  const groupCycles = settlementCycles.filter((cycle) => cycle.groupId === group.id);
  const openSettlementPayments = getOpenSettlementPayments(settlementPayments.filter((payment) => payment.groupId === group.id));
  const voidedSettlementPayments = settlementPayments.filter((payment) => payment.groupId === group.id && payment.voidedAt);
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

  function syncLabel(): string {
    if (syncStatus === 'connecting') return 'Conectando tiempo real...';
    if (syncStatus === 'connected') return lastSyncAt ? 'Actualizado recien' : 'Tiempo real activo';
    if (syncStatus === 'syncing') return 'Actualizando...';
    if (syncStatus === 'error') return 'No se pudo sincronizar';
    return '';
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
    isOwner && onRevokeMember && onRegenerateInvite ? (
      <MembersManager
        members={members}
        currentMembership={currentMembership ?? null}
        onRevokeMember={onRevokeMember}
        onRegenerateInvite={onRegenerateInvite}
      />
    ) : null;

  function renderPayments() {
    return (
      <>
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">Pagos registrados</h2>
          {openSettlementPayments.length === 0 ? (
            <p className="text-sm text-slate-500">Todavia no hay pagos registrados.</p>
          ) : (
            <div className="grid gap-2">
              {openSettlementPayments
                .slice()
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((payment) => (
                  <div key={payment.id} className="rounded-md border border-slate-200 p-3 text-sm text-slate-700">
                    <p>
                      <span className="font-semibold">{participantName(payment.fromParticipantId)}</span> le pago{' '}
                      <span className="font-semibold">{formatARS(payment.amountCents)}</span> a{' '}
                      <span className="font-semibold">{participantName(payment.toParticipantId)}</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{new Date(payment.createdAt).toLocaleDateString('es-AR')}</p>
                    {onVoidSettlementPayment ? (
                      <button
                        type="button"
                        onClick={() => void handleVoidPayment(payment.id)}
                        className="mt-3 rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700"
                      >
                        Anular
                      </button>
                    ) : null}
                  </div>
                ))}
            </div>
          )}
        </section>

        {voidedSettlementPayments.length > 0 ? (
          <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">Pagos anulados</h2>
            {voidedSettlementPayments
              .slice()
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((payment) => (
                <div key={payment.id} className="rounded-md border border-slate-200 p-3 text-sm text-slate-500">
                  {participantName(payment.fromParticipantId)} le habia pagado {formatARS(payment.amountCents)} a{' '}
                  {participantName(payment.toParticipantId)}
                </div>
              ))}
          </section>
        ) : null}
      </>
    );
  }

  function renderTabContent() {
    if (activeTab === 'summary') {
      return (
        <div className="space-y-5">
          <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-slate-500">Total gastado</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{formatARS(totalOpenCents)}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Pendiente por saldar</p>
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
            className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-4 font-medium text-slate-800"
          >
            Copiar resumen
          </button>
        </div>
      );
    }

    if (activeTab === 'movements') {
      return (
        <div className="space-y-5">
          {groupExpenses.length === 0 && openSettlementPayments.length === 0 && groupCycles.length === 0 ? (
            <EmptyState title="Todavia no hay movimientos." />
          ) : null}
          <ExpenseList
            expenses={groupExpenses}
            participants={groupParticipants}
            onEditExpense={openEditExpensePanel}
            onDeleteExpense={onDeleteExpense}
          />
          {renderPayments()}
          <SettlementCyclesList cycles={groupCycles} expenses={groupExpenses} />
        </div>
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
        <section className="grid gap-2 rounded-lg border border-slate-200 bg-white p-4">
          <button
            type="button"
            onClick={handleCopyGroupLink}
            className="min-h-11 rounded-md border border-slate-300 px-4 font-medium text-slate-800"
          >
            Copiar link del grupo
          </button>
          <button
            type="button"
            onClick={handleClose}
            disabled={openExpenses.length === 0 || pendingSettlementCents > 0}
            className="min-h-11 rounded-md bg-slate-900 px-4 font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Cerrar periodo
          </button>
          {pendingSettlementCents > 0 ? (
            <p className="text-sm text-slate-600">Solo podes cerrar el periodo cuando el saldo este en cero.</p>
          ) : null}
          <button
            type="button"
            onClick={onBack}
            className="min-h-11 rounded-md border border-slate-300 px-4 font-medium text-slate-800"
          >
            Volver a Mis grupos
          </button>
          {onSignOut ? (
            <button
              type="button"
              onClick={onSignOut}
              className="min-h-11 rounded-md border border-slate-300 px-4 font-medium text-slate-800"
            >
              Cerrar sesion
            </button>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28 md:pb-0">
      <div className="space-y-5">
        <header className="rounded-lg bg-slate-900 p-4 text-white md:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-300">Grupo</p>
              <h1 className="mt-1 text-xl font-semibold md:text-2xl">{group.name}</h1>
              <p className="mt-2 text-xs text-slate-300">{syncLabel()}</p>
            </div>
            <button type="button" onClick={handleCopyGroupLink} className="text-xs font-semibold text-teal-100">
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
            className="hidden min-h-10 rounded-md bg-teal-700 px-4 font-semibold text-white md:inline-flex md:items-center"
          >
            Agregar gasto
          </button>
        </div>

        {copyStatus ? <p className="text-sm text-slate-600">{copyStatus}</p> : null}

        {onManualRefresh ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
            <span>{syncLabel()}</span>
            <button type="button" onClick={onManualRefresh} className="font-semibold text-teal-800">
              Actualizar
            </button>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p>{errorMessage}</p>
            {onRetry ? (
              <button type="button" onClick={onRetry} className="mt-2 font-semibold text-red-800">
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
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:max-w-xl sm:rounded-xl">
            {expenseForm}
          </div>
        </div>
      ) : null}
    </div>
  );
}
