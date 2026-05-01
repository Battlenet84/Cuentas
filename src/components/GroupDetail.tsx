import { useMemo, useState } from 'react';
import type { Expense, Group, Participant, SettlementCycle } from '../types';
import { calculateBalances, getOpenExpenses, simplifySettlements } from '../lib/calculations';
import { formatARS } from '../lib/money';
import { BalanceSummary } from './BalanceSummary';
import { ExpenseForm } from './ExpenseForm';
import { ExpenseList } from './ExpenseList';
import { ParticipantsManager } from './ParticipantsManager';
import { SettlementCyclesList } from './SettlementCyclesList';
import { SettlementList } from './SettlementList';

type GroupDetailProps = {
  group: Group;
  participants: Participant[];
  expenses: Expense[];
  settlementCycles: SettlementCycle[];
  onBack: () => void;
  onAddParticipant: (name: string, alias?: string) => void;
  onUpdateParticipant: (participant: Participant) => void;
  onCreateExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => void;
  onUpdateExpense: (expense: Expense) => void;
  onDeleteExpense: (expenseId: string) => void;
  onCloseOpenExpenses: () => void;
};

export function GroupDetail({
  group,
  participants,
  expenses,
  settlementCycles,
  onBack,
  onAddParticipant,
  onUpdateParticipant,
  onCreateExpense,
  onUpdateExpense,
  onDeleteExpense,
  onCloseOpenExpenses
}: GroupDetailProps) {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [isExpensePanelOpen, setIsExpensePanelOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const groupParticipants = participants.filter((participant) => participant.groupId === group.id);
  const groupExpenses = expenses.filter((expense) => expense.groupId === group.id);
  const groupCycles = settlementCycles.filter((cycle) => cycle.groupId === group.id);
  const openExpenses = getOpenExpenses(groupExpenses);
  const totalOpenCents = openExpenses.reduce((total, expense) => total + expense.amountCents, 0);

  const balances = useMemo(
    () => calculateBalances(group, groupParticipants, groupExpenses),
    [group, groupParticipants, groupExpenses]
  );
  const settlements = useMemo(() => simplifySettlements(balances), [balances]);

  function participantName(id: string): string {
    return groupParticipants.find((participant) => participant.id === id)?.name ?? 'Participante';
  }

  function buildWhatsAppSummary(): string {
    const lines = [`Resumen de "${group.name}"`, '', `Total abierto: ${formatARS(totalOpenCents)}`, '', 'Para saldar:'];

    if (settlements.length === 0) {
      lines.push('Todo está saldado.');
    } else {
      for (const settlement of settlements) {
        lines.push(
          `- ${participantName(settlement.fromParticipantId)} le paga ${formatARS(settlement.amountCents)} a ${participantName(
            settlement.toParticipantId
          )}`
        );
      }
    }

    return lines.join('\n');
  }

  function buildGroupLink(): string {
    const origin = window.location.origin;
    const token = group.shareToken ?? group.id;
    return `${origin}/group/${group.id}?share=${token}`;
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

  function handleClose() {
    if (openExpenses.length === 0) return;
    const confirmed = window.confirm(
      'Esto va a sacar los gastos abiertos del balance actual. Usalo solo si ya registraron o acordaron los pagos.'
    );
    if (confirmed) onCloseOpenExpenses();
  }

  const expenseForm = (
    <ExpenseForm
      groupId={group.id}
      participants={groupParticipants}
      expense={editingExpense}
      onCreateExpense={onCreateExpense}
      onUpdateExpense={onUpdateExpense}
      onCancel={isExpensePanelOpen ? closeExpensePanel : undefined}
    />
  );

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="text-sm font-medium text-teal-800">
        Volver a grupos
      </button>

      <header className="rounded-lg bg-slate-900 p-5 text-white">
        <p className="text-sm text-slate-300">Grupo</p>
        <h1 className="mt-1 text-2xl font-semibold">{group.name}</h1>
        <p className="mt-3 text-sm text-slate-200">
          {groupParticipants.length} participantes · {groupExpenses.length} gastos · Abierto {formatARS(totalOpenCents)}
        </p>
      </header>

      <div className="grid gap-3">
        <button
          type="button"
          onClick={openCreateExpensePanel}
          className="min-h-12 rounded-md bg-teal-700 px-4 text-base font-semibold text-white shadow-sm hover:bg-teal-800 lg:hidden"
        >
          Agregar gasto
        </button>

        <div className="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={handleCopySummary}
            className="min-h-11 rounded-md border border-slate-300 bg-white px-4 font-medium text-slate-800"
          >
            Copiar para WhatsApp
          </button>
          <button
            type="button"
            onClick={handleCopyGroupLink}
            className="min-h-11 rounded-md border border-slate-300 bg-white px-4 font-medium text-slate-800"
          >
            Copiar link del grupo
          </button>
          <button
            type="button"
            onClick={handleClose}
            disabled={openExpenses.length === 0}
            className="min-h-11 rounded-md bg-slate-900 px-4 font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Cerrar período
          </button>
        </div>
      </div>
      {copyStatus ? <p className="text-sm text-slate-600">{copyStatus}</p> : null}

      <div className="space-y-5 lg:hidden">
        <SettlementList settlements={settlements} participants={groupParticipants} />
        <BalanceSummary balances={balances} participants={groupParticipants} />
        <ExpenseList
          expenses={groupExpenses}
          participants={groupParticipants}
          onEditExpense={openEditExpensePanel}
          onDeleteExpense={onDeleteExpense}
        />
        <ParticipantsManager
          groupId={group.id}
          participants={participants}
          expenses={expenses}
          onAddParticipant={onAddParticipant}
          onUpdateParticipant={onUpdateParticipant}
        />
        <SettlementCyclesList cycles={groupCycles} expenses={groupExpenses} />
      </div>

      <div className="hidden gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-5">
          <SettlementList settlements={settlements} participants={groupParticipants} />
          <BalanceSummary balances={balances} participants={groupParticipants} />
          <ExpenseList
            expenses={groupExpenses}
            participants={groupParticipants}
            onEditExpense={openEditExpensePanel}
            onDeleteExpense={onDeleteExpense}
          />
        </main>

        <aside className="space-y-5">
          <ParticipantsManager
            groupId={group.id}
            participants={participants}
            expenses={expenses}
            onAddParticipant={onAddParticipant}
            onUpdateParticipant={onUpdateParticipant}
          />
          {expenseForm}
          <SettlementCyclesList cycles={groupCycles} expenses={groupExpenses} />
        </aside>
      </div>

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
