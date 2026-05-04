import { useEffect, useMemo, useRef, useState } from 'react';
import { CreateGroupForm } from './components/CreateGroupForm';
import { GroupDetail } from './components/GroupDetail';
import { GroupList } from './components/GroupList';
import { JoinGroupCard } from './components/JoinGroupCard';
import { AuthScreen } from './components/AuthScreen';
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
  createSettlementPaymentByToken,
  createRemoteExpense,
  createRemoteGroup,
  createRemoteParticipant,
  deleteRemoteExpense,
  getGroupMembers,
  getMyProfile,
  joinGroupByToken,
  loadGroupByShareToken,
  loadMyGroups,
  regenerateGroupInviteToken,
  revokeGroupMember,
  upsertMyProfile,
  type GroupMemberView,
  updateMyGroupIdentity,
  updateRemoteExpense,
  updateRemoteParticipant
} from './data/supabaseStorage';
import { subscribeToGroupChanges, type RealtimeStatus } from './data/realtime';
import { getCurrentSession, listenToAuthChanges, signInWithEmail, signOut, signUpWithEmail } from './data/auth';
import { getOpenExpenses } from './lib/calculations';
import { createId, createShareToken } from './lib/ids';
import { isSupabaseConfigured, supabaseConfigError } from './lib/supabase';
import type { AppState, Expense, Participant, Profile, Settlement } from './types';

type Route =
  | { kind: 'home' }
  | { kind: 'localGroup'; groupId: string }
  | { kind: 'sharedGroup'; shareToken: string };

function routeFromLocation(pathname: string, search: string): Route {
  const shareToken = new URLSearchParams(search).get('share');
  if (shareToken) return { kind: 'sharedGroup', shareToken };

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
  const [route, setRoute] = useState<Route>(() => routeFromLocation(window.location.pathname, window.location.search));
  const [routeMessage, setRouteMessage] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isLoadingGroup, setIsLoadingGroup] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMemberView[]>([]);
  const [syncStatus, setSyncStatus] = useState<RealtimeStatus>('idle');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const realtimeRefreshTimeoutRef = useRef<number | null>(null);
  const isRealtimeRefreshingRef = useRef(false);

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
    if (!isSupabaseConfigured) return;

    setAuthLoading(true);
    getCurrentSession()
      .then((session) => {
        setAuthUserId(session?.user.id ?? null);
        setAuthError(null);
        if (session?.user.id) void getMyProfile().then(setProfile).catch(() => setProfile(null));
      })
      .catch(() => {
        setAuthError('No se pudo cargar la sesión.');
      })
      .finally(() => setAuthLoading(false));

    const cleanup = listenToAuthChanges((_event, session) => {
      setAuthUserId(session?.user.id ?? null);
      if (session?.user.id) void getMyProfile().then(setProfile).catch(() => setProfile(null));
      if (!session) setState(emptyState);
    });

    return cleanup;
  }, []);

  useEffect(() => {
    function handlePopState() {
      setRoute(routeFromLocation(window.location.pathname, window.location.search));
      setRouteMessage(null);
      setDetailError(null);
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (route.kind !== 'sharedGroup') return;

    const expectedPath = routePath(route);
    if (window.location.pathname !== expectedPath || window.location.search) {
      window.history.replaceState(null, '', expectedPath);
    }

    if (!isSupabaseConfigured) {
      setRouteMessage(supabaseConfigError);
      setDetailError('No se pudo cargar la información del grupo.');
      return;
    }

    if (authLoading || authError || !authUserId) return;

    void refreshRemoteGroup(route.shareToken);
  }, [authError, authLoading, authUserId, route]);

  useEffect(() => {
    if (!isSupabaseConfigured || authLoading || authError || !authUserId || route.kind !== 'home') return;

    setIsLoadingGroup(true);
    loadMyGroups()
      .then((myState) => {
        setState(myState);
        setRouteMessage(null);
      })
      .catch(() => setRouteMessage('No se pudieron cargar tus grupos.'))
      .finally(() => setIsLoadingGroup(false));
  }, [authError, authLoading, authUserId, route.kind]);

  useEffect(() => {
    if (route.kind !== 'sharedGroup' || !isSupabaseConfigured || authLoading || authError || !authUserId) {
      setSyncStatus('idle');
      return;
    }

    const cleanup = subscribeToGroupChanges({
      shareToken: route.shareToken,
      onStatusChange: setSyncStatus,
      onError: () => setDetailError('No se pudo sincronizar.'),
      onChange: () => {
        if (realtimeRefreshTimeoutRef.current) window.clearTimeout(realtimeRefreshTimeoutRef.current);

        realtimeRefreshTimeoutRef.current = window.setTimeout(() => {
          if (isRealtimeRefreshingRef.current) return;

          isRealtimeRefreshingRef.current = true;
          setSyncStatus('syncing');
          refreshRemoteGroup(route.shareToken, { quiet: true })
            .catch(() => {
              setSyncStatus('error');
              setDetailError('No se pudo sincronizar.');
            })
            .finally(() => {
              isRealtimeRefreshingRef.current = false;
            });
        }, 300);
      }
    });

    return () => {
      if (realtimeRefreshTimeoutRef.current) {
        window.clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }
      cleanup();
    };
  }, [authError, authLoading, authUserId, route]);

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

  async function refreshRemoteGroup(shareToken: string, options?: { quiet?: boolean }) {
    if (!options?.quiet) setIsLoadingGroup(true);
    setDetailError(null);
    try {
      const remoteState = await loadGroupByShareToken(shareToken);
      setState(remoteState);
      setRouteMessage(null);
      setLastSyncAt(new Date().toISOString());
      if (route.kind === 'sharedGroup') setSyncStatus('connected');
      const group = remoteState.groups[0];
      if (group?.shareToken && group.shareToken !== shareToken && remoteState.accessStatus === 'member') {
        navigate({ kind: 'sharedGroup', shareToken: group.shareToken }, true);
      }
      if (group && remoteState.currentMembership?.role === 'owner' && remoteState.currentMembership.status === 'active') {
        const members = await getGroupMembers(group.shareToken ?? shareToken);
        setGroupMembers(members);
      } else {
        setGroupMembers([]);
      }
    } catch {
      setDetailError('No se pudo cargar la información del grupo.');
      setRouteMessage('No encontramos este grupo.');
      setState({ groups: [], participants: [], expenses: [], settlementCycles: [], settlementPayments: [] });
      setGroupMembers([]);
      setSyncStatus('error');
    } finally {
      if (!options?.quiet) setIsLoadingGroup(false);
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
    if (isSupabaseConfigured) {
      const group = state.groups.find((item) => item.id === groupId);
      if (group?.shareToken) {
        navigate({ kind: 'sharedGroup', shareToken: group.shareToken });
        return;
      }
    }
    navigate({ kind: 'localGroup', groupId });
  }

  function openHome() {
    if (isSupabaseConfigured) setState(emptyState);
    navigate({ kind: 'home' });
  }

  async function handleSignIn(email: string, password: string) {
    const session = await signInWithEmail(email, password);
    setAuthUserId(session.user.id);
    setProfile(await getMyProfile());
    setAuthError(null);
  }

  async function handleSignUp(email: string, password: string, signupProfile: { displayName: string; paymentAlias?: string }) {
    const session = await signUpWithEmail(email, password);
    setAuthUserId(session?.user.id ?? null);
    setProfile(await upsertMyProfile(signupProfile));
    setAuthError(null);
  }

  async function handleSignOut() {
    await signOut();
    setAuthUserId(null);
    setProfile(null);
    setState(emptyState);
    navigate({ kind: 'home' }, true);
  }

  async function handleCreateGroup(input: { name: string; ownerParticipantName: string; ownerParticipantAlias?: string }) {
    if (isSupabaseConfigured) {
      if (!authUserId) {
        setRouteMessage('Iniciá sesión para crear grupos.');
        return;
      }
      setIsSaving(true);
      setDetailError(null);
      try {
        const group = await createRemoteGroup(input);
        setState({ groups: [group], participants: [], expenses: [], settlementCycles: [], settlementPayments: [] });
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
      name: input.name,
      createdAt: new Date().toISOString(),
      shareToken: createShareToken(),
      archivedAt: null
    };
    persist((current) => {
      const next = createGroup(current, group);
      if (!input.ownerParticipantName) return next;
      return createParticipant(next, {
        id: createId('participant'),
        groupId: group.id,
        name: input.ownerParticipantName,
        alias: input.ownerParticipantAlias,
        isActive: true
      });
    });
    openLocalGroup(group.id);
  }

  async function handleJoinGroup(input: { participantId?: string | null; newParticipantName?: string; newParticipantAlias?: string }) {
    if (route.kind !== 'sharedGroup') return;

    await runRemoteOperation(
      route.shareToken,
      () => joinGroupByToken(route.shareToken, input).then(() => undefined),
      'No se pudo entrar al grupo.'
    );
  }

  async function handleChangeIdentity(participantId: string) {
    if (route.kind !== 'sharedGroup') return;

    await runRemoteOperation(
      route.shareToken,
      () => updateMyGroupIdentity(route.shareToken, participantId).then(() => undefined),
      'No se pudo guardar tu identidad.'
    );
  }

  async function handleCreateIdentityParticipant(name: string, alias?: string) {
    if (route.kind !== 'sharedGroup') return;

    await runRemoteOperation(
      route.shareToken,
      async () => {
        const participant = await createRemoteParticipant(route.shareToken, { name, alias });
        await updateMyGroupIdentity(route.shareToken, participant.id);
      },
      'No se pudo guardar tu identidad.'
    );
  }

  async function handleRevokeMember(membershipId: string) {
    if (route.kind !== 'sharedGroup') return;

    await runRemoteOperation(
      route.shareToken,
      () => revokeGroupMember(route.shareToken, membershipId),
      'No se pudo revocar el acceso.'
    );
  }

  async function handleRegenerateInvite() {
    if (route.kind !== 'sharedGroup') return;

    setIsSaving(true);
    try {
      const group = await regenerateGroupInviteToken(route.shareToken);
      const nextToken = group.shareToken ?? route.shareToken;
      navigate({ kind: 'sharedGroup', shareToken: nextToken }, true);
      await refreshRemoteGroup(nextToken);
    } catch {
      setDetailError('No se pudo regenerar el link.');
      throw new Error('No se pudo regenerar el link.');
    } finally {
      setIsSaving(false);
    }
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

  async function handleSettleDebt(settlement: Settlement) {
    if (route.kind !== 'sharedGroup') return;

    await runRemoteOperation(
      route.shareToken,
      () =>
        createSettlementPaymentByToken(route.shareToken, {
          fromParticipantId: settlement.fromParticipantId,
          toParticipantId: settlement.toParticipantId,
          amountCents: settlement.amountCents
        }).then(() => undefined),
      'No se pudo registrar el pago.'
    );
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

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-6">
        <main className="mx-auto max-w-3xl rounded-lg bg-white p-5 shadow-sm">
          <p className="font-medium text-slate-800">Preparando identidad anónima...</p>
        </main>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-6">
        <main className="mx-auto max-w-3xl rounded-lg border border-red-200 bg-red-50 p-5 text-red-800">
          <p className="font-medium">{authError}</p>
        </main>
      </div>
    );
  }

  if (isSupabaseConfigured && !authUserId) {
    return <AuthScreen onSignIn={handleSignIn} onSignUp={handleSignUp} />;
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

  if (route.kind === 'sharedGroup' && selectedGroup && state.accessStatus === 'requires_join') {
    return (
      <JoinGroupCard
        group={selectedGroup}
        participants={state.participants}
        claimedParticipantIds={state.claimedParticipantIds}
        defaultName={profile?.displayName ?? ''}
        defaultAlias={profile?.paymentAlias ?? ''}
        onJoin={handleJoinGroup}
        onBack={openHome}
      />
    );
  }

  if (route.kind === 'sharedGroup' && state.accessStatus === 'revoked') {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center bg-slate-50 px-4 py-6">
        <section className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-800">
          <h1 className="text-xl font-semibold">Tu acceso a este grupo fue revocado.</h1>
          <button type="button" onClick={openHome} className="mt-4 font-semibold text-red-900">
            Volver al inicio
          </button>
        </section>
      </main>
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
            settlementPayments={state.settlementPayments}
            currentMembership={state.currentMembership ?? null}
            members={groupMembers}
            onBack={openHome}
            onSignOut={isSupabaseConfigured ? handleSignOut : undefined}
            onAddParticipant={(name, alias) => handleAddParticipant(selectedGroup.id, name, alias)}
            onUpdateParticipant={handleUpdateParticipant}
            onCreateExpense={handleCreateExpense}
            onUpdateExpense={handleUpdateExpense}
            onDeleteExpense={handleDeleteExpense}
            onSettleDebt={route.kind === 'sharedGroup' ? handleSettleDebt : undefined}
            onCloseOpenExpenses={() => handleCloseOpenExpenses(selectedGroup.id)}
            onRetry={route.kind === 'sharedGroup' ? () => refreshRemoteGroup(route.shareToken) : undefined}
            onManualRefresh={route.kind === 'sharedGroup' ? () => refreshRemoteGroup(route.shareToken, { quiet: true }) : undefined}
            onChangeIdentity={route.kind === 'sharedGroup' ? handleChangeIdentity : undefined}
            onCreateIdentityParticipant={route.kind === 'sharedGroup' ? handleCreateIdentityParticipant : undefined}
            onRevokeMember={route.kind === 'sharedGroup' ? handleRevokeMember : undefined}
            onRegenerateInvite={route.kind === 'sharedGroup' ? handleRegenerateInvite : undefined}
            errorMessage={detailError}
            isSaving={isSaving}
            useSharedLink={route.kind === 'sharedGroup'}
            syncStatus={syncStatus}
            lastSyncAt={lastSyncAt}
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

        {isSupabaseConfigured ? (
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="self-start rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
          >
            Cerrar sesión
          </button>
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

        <CreateGroupForm
          onCreate={(input) => void handleCreateGroup(input)}
          requiresOwnerName={isSupabaseConfigured}
          defaultOwnerName={profile?.displayName ?? ''}
          defaultOwnerAlias={profile?.paymentAlias ?? ''}
        />
        {isSaving ? <p className="text-sm font-medium text-slate-600">Guardando cambios...</p> : null}
        {isSupabaseConfigured ? <h2 className="text-lg font-semibold text-slate-900">Mis grupos</h2> : null}
        <GroupList groups={state.groups} participants={state.participants} onOpenGroup={openLocalGroup} />
      </main>
    </div>
  );
}

export default App;
