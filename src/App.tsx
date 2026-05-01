import { useEffect, useMemo, useState } from 'react';
import { CreateGroupForm } from './components/CreateGroupForm';
import { GroupDetail } from './components/GroupDetail';
import { GroupList } from './components/GroupList';
import {
  assignSettlementCycleToExpenses,
  createExpense,
  createGroup,
  createParticipant,
  createSettlementCycle,
  deleteExpense,
  loadState,
  saveState,
  updateExpense,
  updateParticipant
} from './data/storage';
import { getOpenExpenses } from './lib/calculations';
import { createId, createShareToken } from './lib/ids';
import type { AppState, Expense, Participant } from './types';

function groupIdFromPath(pathname: string): string | null {
  const match = /^\/group\/([^/]+)$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(() => groupIdFromPath(window.location.pathname));
  const [routeMessage, setRouteMessage] = useState<string | null>(null);

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    function handlePopState() {
      setSelectedGroupId(groupIdFromPath(window.location.pathname));
      setRouteMessage(null);
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const selectedGroup = useMemo(
    () => state.groups.find((group) => group.id === selectedGroupId) ?? null,
    [state.groups, selectedGroupId]
  );

  useEffect(() => {
    if (!selectedGroupId || selectedGroup) return;

    setRouteMessage('No encontramos ese grupo en este dispositivo.');
    setSelectedGroupId(null);
    window.history.replaceState(null, '', '/');
  }, [selectedGroup, selectedGroupId]);

  function persist(updater: (current: AppState) => AppState) {
    setState((current) => updater(current));
  }

  function openGroup(groupId: string) {
    setRouteMessage(null);
    setSelectedGroupId(groupId);
    window.history.pushState(null, '', `/group/${encodeURIComponent(groupId)}`);
  }

  function openHome() {
    setSelectedGroupId(null);
    window.history.pushState(null, '', '/');
  }

  function handleCreateGroup(name: string) {
    const group = {
      id: createId('group'),
      name,
      createdAt: new Date().toISOString(),
      shareToken: createShareToken(),
      archivedAt: null
    };
    persist((current) => createGroup(current, group));
    openGroup(group.id);
  }

  function handleAddParticipant(groupId: string, name: string, alias?: string) {
    const participant: Participant = {
      id: createId('participant'),
      groupId,
      name,
      alias,
      isActive: true
    };
    persist((current) => createParticipant(current, participant));
  }

  function handleCreateExpense(expense: Omit<Expense, 'id' | 'createdAt'>) {
    persist((current) =>
      createExpense(current, {
        ...expense,
        id: createId('expense'),
        createdAt: new Date().toISOString()
      })
    );
  }

  function handleCloseOpenExpenses(groupId: string) {
    persist((current) => {
      const openExpenses = getOpenExpenses(current.expenses.filter((expense) => expense.groupId === groupId));
      if (openExpenses.length === 0) return current;

      const cycle = {
        id: createId('settlement'),
        groupId,
        title: `Cierre ${new Date().toLocaleDateString('es-AR')}`,
        closedAt: new Date().toISOString()
      };

      const withCycle = createSettlementCycle(current, cycle);
      return assignSettlementCycleToExpenses(
        withCycle,
        groupId,
        openExpenses.map((expense) => expense.id),
        cycle.id
      );
    });
  }

  if (selectedGroup) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
          <GroupDetail
            group={selectedGroup}
            participants={state.participants}
            expenses={state.expenses}
            settlementCycles={state.settlementCycles}
            onBack={openHome}
            onAddParticipant={(name, alias) => handleAddParticipant(selectedGroup.id, name, alias)}
            onUpdateParticipant={(participant) => persist((current) => updateParticipant(current, participant))}
            onCreateExpense={handleCreateExpense}
            onUpdateExpense={(expense) => persist((current) => updateExpense(current, expense))}
            onDeleteExpense={(expenseId) => persist((current) => deleteExpense(current, expenseId))}
            onCloseOpenExpenses={() => handleCloseOpenExpenses(selectedGroup.id)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
        <header>
          <p className="text-sm font-medium uppercase tracking-wide text-teal-700">Cuentas Claras</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Grupos para dividir gastos</h1>
          <p className="mt-2 text-slate-600">
            Creá grupos permanentes, cargá gastos con el tiempo y mirá cómo saldar cuentas.
          </p>
        </header>

        {routeMessage ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
            {routeMessage}
          </p>
        ) : null}

        <CreateGroupForm onCreate={handleCreateGroup} />
        <GroupList groups={state.groups} participants={state.participants} onOpenGroup={openGroup} />
      </main>
    </div>
  );
}

export default App;
