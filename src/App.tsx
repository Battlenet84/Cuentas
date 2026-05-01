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
  emptyState,
  loadState,
  saveState,
  updateExpense,
  updateParticipant
} from './data/storage';
import {
  closeRemoteSettlementCycle,
  createRemoteExpense,
  createRemoteGroup,
  createRemoteParticipant,
  deleteRemoteExpense,
  loadGroupByShareToken,
  updateRemoteExpense,
  updateRemoteParticipant
} from './data/supabaseStorage';
import { getOpenExpenses } from './lib/calculations';
import { createId, createShareToken } from './lib/ids';
import { isSupabaseConfigured, supabaseConfigError } from './lib/supabase';
import type { AppState, Expense, Participant } from './types';

type Route =
  | { kind: 'home' }
  | { kind: 'localGroup'; groupId: string }
  | { kind: 'sharedGroup'; shareToken: string };

function routeFromPath(pathname: string): Route {
  const sharedMatch = /^\/g\/([^/]+)$/.exec(pathname);
  if (sharedMatch) return { kind: 'sharedGroup', shareToken: decodeURIComponent(sharedMatch[1]) };

  const localMatch = /^\/group\/([^/]+)$/.exec(pathname);
  if (localMatch) return { kind: 'localGroup', groupId: decodeURIComponent(localMatch[1]) };

  return { kind: 'home' };
}

function routePath(route: Route): string {
  if (route.kind === 'sharedGroup') return `/g/${encodeURIComponent(route.shareToken)}`;
  if (route.kind === 'localGroup') return `/group/${encodeURIComponent(route.groupId)}`;
  return '/';
}

function App() {
  const [state, setState] = useState<AppState>(() => (isSupabaseConfigured ? emptyState : loadState()));
  const [route, setRoute] = useState<Route>(() => routeFromPath(window.location.pathname));
  const [routeMessage, setRouteMessage] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isLoadingGroup, setIsLoadingGroup] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const selectedGroupId =
    route.kind === 'localGroup'
      ? route.groupId
      : route.kind === 'sharedGroup'
        ? state.groups[0]?.id ?? null
        : null;
  const selectedGroup = useMemo(
    () => state.groups.find((group) => group.id === selectedGroupId) ?? null,
    [state.groups, selectedGroupId]
  );

  useEffect(() => {
    if (!isSupabaseConfigured && route.kind !== 'sharedGroup') saveState(state);
  }, [route.kind, state]);

  useEffect(() => {
    function handlePopState() {
      setRoute(routeFromPath(window.location.pathname));
      setRouteMessage(null);
      setDetailError(null);
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (route.kind !== 'sharedGroup') return;

    if (!isSupabaseConfigured) {
      setRouteMessage(supabaseConfigError);
      setDetailError('No se pudo cargar la información del grupo.');
      return;
    }

    void refreshRemoteGroup(route.shareToken);
  }, [route]);

  useEffect(() => {
    if (route.kind !== 'localGroup') return;
    const exists = state.groups.some((group) => group.id === route.groupId);
    if (exists) return;

    setRouteMessage('No encontramos ese grupo en este dispositivo.');
    navigate({ kind: 'home' }, true);
  }, [route, state.groups]);

  function persist(updater: (current: AppState) => AppState) {
    setState((current) => updater(current));
  }

  function navigate(nextRoute: Route, replace = false) {
    setRoute(nextRoute);
    setRouteMessage(null);
    setDetailError(null);
    const path = routePath(nextRoute);
    if (replace) window.history.replaceState(null, '', path);
    else window.history.pushState(null, '', path);
  }

  async function refreshRemoteGroup(shareToken: string) {
    setIsLoadingGroup(true);
    setDetailError(null);
    try {
      const remoteState = await loadGroupByShareToken(shareToken);
      setState(remoteState);
      setRouteMessage(null);
    } catch {
      setDetailError('No se pudo cargar la información del grupo.');
      setRouteMessage('No encontramos este grupo.');
      setState({ groups: [], participants: [], expenses: [], settlementCycles: [] });
    } finally {
      setIsLoadingGroup(false);
    }
  }

  async function runRemoteOperation(shareToken: string, operation: () => Promise<void>, fallbackMessage: string) {
    setIsSaving(true);
    setDetailError(null);
    try {
      await operation();
      await refreshRemoteGroup(shareToken);
    } catch {
      setDetailError(fallbackMessage);
      throw new Error(fallbackMessage);
    } finally {
      setIsSaving(false);
    }
  }

  function openLocalGroup(groupId: string) {
    navigate({ kind: 'localGroup', groupId });
  }

  function openHome() {
    if (isSupabaseConfigured) setState(emptyState);
    navigate({ kind: 'home' });
  }

  async function handleCreateGroup(name: string) {
    if (isSupabaseConfigured) {
      setIsSaving(true);
      setDetailError(null);
      try {
        const group = await createRemoteGroup(name);
        setState({ groups: [group], participants: [], expenses: [], settlementCycles: [] });
        navigate({ kind: 'sharedGroup', shareToken: group.shareToken ?? group.id });
      } catch {
        setRouteMessage('No se pudo crear el grupo.');
      } finally {
        setIsSaving(false);
      }
      return;
    }

    const group = {
      id: createId('group'),
      name,
      createdAt: new Date().toISOString(),
      shareToken: createShareToken(),
      archivedAt: null
    };
    persist((current) => createGroup(current, group));
    openLocalGroup(group.id);
  }

  async function handleAddParticipant(groupId: string, name: string, alias?: string) {
    if (route.kind === 'sharedGroup') {
      await runRemoteOperation(
        route.shareToken,
        () => createRemoteParticipant(route.shareToken, { name, alias }).then(() => undefined),
        'No se pudo guardar el participante.'
      );
      return;
    }

    const participant: Participant = {
      id: createId('participant'),
      groupId,
      name,
      alias,
      isActive: true
    };
    persist((current) => createParticipant(current, participant));
  }

  async function handleUpdateParticipant(participant: Participant) {
    if (route.kind === 'sharedGroup') {
      await runRemoteOperation(
        route.shareToken,
        () => updateRemoteParticipant(route.shareToken, participant).then(() => undefined),
        'No se pudo guardar el participante.'
      );
      return;
    }

    persist((current) => updateParticipant(current, participant));
  }

  async function handleCreateExpense(expense: Omit<Expense, 'id' | 'createdAt'>) {
    if (route.kind === 'sharedGroup') {
      await runRemoteOperation(
        route.shareToken,
        () => createRemoteExpense(route.shareToken, expense).then(() => undefined),
        'No se pudo guardar el gasto.'
      );
      return;
    }

    persist((current) =>
      createExpense(current, {
        ...expense,
        id: createId('expense'),
        createdAt: new Date().toISOString()
      })
    );
  }

  async function handleUpdateExpense(expense: Expense) {
    if (route.kind === 'sharedGroup') {
      await runRemoteOperation(
        route.shareToken,
        () => updateRemoteExpense(route.shareToken, expense).then(() => undefined),
        'No se pudo guardar el gasto.'
      );
      return;
    }

    persist((current) => updateExpense(current, expense));
  }

  async function handleDeleteExpense(expenseId: string) {
    if (route.kind === 'sharedGroup') {
      await runRemoteOperation(
        route.shareToken,
        () => deleteRemoteExpense(route.shareToken, expenseId),
        'No se pudo eliminar el gasto.'
      );
      return;
    }

    persist((current) => deleteExpense(current, expenseId));
  }

  async function handleCloseOpenExpenses(groupId: string) {
    if (route.kind === 'sharedGroup') {
      await runRemoteOperation(
        route.shareToken,
        () => closeRemoteSettlementCycle(route.shareToken).then(() => undefined),
        'No se pudo cerrar el período.'
      );
      return;
    }

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

  if (isLoadingGroup) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-6">
        <main className="mx-auto max-w-3xl rounded-lg bg-white p-5 shadow-sm">
          <p className="font-medium text-slate-800">Cargando grupo...</p>
        </main>
      </div>
    );
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
            onUpdateParticipant={handleUpdateParticipant}
            onCreateExpense={handleCreateExpense}
            onUpdateExpense={handleUpdateExpense}
            onDeleteExpense={handleDeleteExpense}
            onCloseOpenExpenses={() => handleCloseOpenExpenses(selectedGroup.id)}
            onRetry={route.kind === 'sharedGroup' ? () => refreshRemoteGroup(route.shareToken) : undefined}
            errorMessage={detailError}
            isSaving={isSaving}
            useSharedLink={route.kind === 'sharedGroup'}
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

        {!isSupabaseConfigured ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
            Modo local activo. Para compartir grupos entre celulares configurá Supabase.
          </p>
        ) : null}

        {routeMessage ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
            <p>{routeMessage}</p>
            {route.kind === 'sharedGroup' && isSupabaseConfigured ? (
              <button type="button" onClick={() => refreshRemoteGroup(route.shareToken)} className="mt-2 font-semibold">
                Reintentar
              </button>
            ) : null}
          </div>
        ) : null}

        <CreateGroupForm onCreate={(name) => void handleCreateGroup(name)} />
        {isSaving ? <p className="text-sm font-medium text-slate-600">Guardando cambios...</p> : null}
        <GroupList groups={state.groups} participants={state.participants} onOpenGroup={openLocalGroup} />
      </main>
    </div>
  );
}

export default App;
