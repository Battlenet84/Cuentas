import { useEffect, useMemo, useRef, useState } from 'react';
import { CreateGroupForm } from './components/CreateGroupForm';
import { GroupDetail } from './components/GroupDetail';
import { GroupList } from './components/GroupList';
import { JoinGroupCard } from './components/JoinGroupCard';
import { AuthScreen } from './components/AuthScreen';
import { ResetPasswordScreen } from './components/ResetPasswordScreen';
import { ProfileCard } from './components/ProfileCard';
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
  approveGroupMember,
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
  demoteGroupOwnerToMember,
  promoteGroupMemberToOwner,
  regenerateGroupInviteToken,
  rejectGroupMember,
  revokeGroupMember,
  upsertMyProfile,
  type GroupMemberView,
  updateMyGroupIdentity,
  updateMyGroupProfile,
  updateMyProfile,
  updateRemoteExpense,
  updateRemoteParticipant,
  voidSettlementPaymentByToken
} from './data/supabaseStorage';
import { subscribeToGroupChanges, type RealtimeStatus } from './data/realtime';
import { getCurrentSession, listenToAuthChanges, resetPasswordForEmail, signInWithEmail, signOut, signUpWithEmail } from './data/auth';
import { getOpenExpenses } from './lib/calculations';
import { createId, createShareToken } from './lib/ids';
import { isSupabaseConfigured, supabaseConfigError } from './lib/supabase';
import type { AppState, Expense, Participant, Profile, Settlement } from './types';

type Route =
  | { kind: 'home' }
  | { kind: 'localGroup'; groupId: string }
  | { kind: 'sharedGroup'; shareToken: string }
  | { kind: 'resetPassword' };

function routeFromLocation(pathname: string, search: string): Route {
  if (pathname === '/reset-password') return { kind: 'resetPassword' };

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
  if (route.kind === 'resetPassword') return '/reset-password';
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
  const realtimeRefreshTimeoutRef = useRef<number | null>(null);
  const isRealtimeRefreshingRef = useRef(false);
  const isExpensePanelOpenRef = useRef(false);
  const hasPendingRemoteUpdateRef = useRef(false);

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
        if (isExpensePanelOpenRef.current) {
          hasPendingRemoteUpdateRef.current = true;
          setSyncStatus('syncing');
          return;
        }

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
      setState({ groups: [], participants: [], expenses: [], settlementCycles: [], settlementPayments: [], activityLogs: [] });
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
    } catch (error) {
      console.error(fallbackMessage, error);
      setDetailError(fallbackMessage);
      throw new Error(fallbackMessage);
    } finally {
      setIsSaving(false);
    }
  }

  function handleExpensePanelOpenChange(isOpen: boolean) {
    isExpensePanelOpenRef.current = isOpen;
    if (isOpen || !hasPendingRemoteUpdateRef.current || route.kind !== 'sharedGroup') return;

    hasPendingRemoteUpdateRef.current = false;
    void refreshRemoteGroup(route.shareToken, { quiet: true }).catch(() => {
      setDetailError('No se pudo sincronizar.');
      setSyncStatus('error');
    });
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

  async function handleResetPasswordEmail(email: string) {
    await resetPasswordForEmail(email, `${window.location.origin}/reset-password`);
  }

  async function handleSignOut() {
    await signOut();
    setAuthUserId(null);
    setProfile(null);
    setState(emptyState);
    navigate({ kind: 'home' }, true);
  }

  async function handleSaveProfile(input: { displayName?: string; paymentAlias?: string }) {
    const nextProfile = await updateMyProfile(input);
    setProfile(nextProfile);
  }

  async function handleCreateGroup(input: { name: string; ownerParticipantName: string; ownerParticipantAlias?: string; ownerAliasSource?: 'profile' | 'custom' }) {
    if (isSupabaseConfigured) {
      if (!authUserId) {
        setRouteMessage('Iniciá sesión para crear grupos.');
        return;
      }
      setIsSaving(true);
      setDetailError(null);
      try {
        const group = await createRemoteGroup(input);
        setState({ groups: [group], participants: [], expenses: [], settlementCycles: [], settlementPayments: [], activityLogs: [] });
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

  async function handleUpdateMyGroupProfile(input: { participantName: string; participantAlias?: string; useProfileAlias: boolean }) {
    if (route.kind !== 'sharedGroup') return;

    await runRemoteOperation(
      route.shareToken,
      () => updateMyGroupProfile(route.shareToken, input).then(() => undefined),
      'No se pudieron guardar tus datos.'
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

  async function handleApproveMember(membershipId: string) {
    if (route.kind !== 'sharedGroup') return;

    await runRemoteOperation(
      route.shareToken,
      () => approveGroupMember(route.shareToken, membershipId),
      'No se pudo aprobar el acceso.'
    );
  }

  async function handleRejectMember(membershipId: string) {
    if (route.kind !== 'sharedGroup') return;

    await runRemoteOperation(
      route.shareToken,
      () => rejectGroupMember(route.shareToken, membershipId),
      'No se pudo rechazar el acceso.'
    );
  }

  async function handlePromoteMember(membershipId: string) {
    if (route.kind !== 'sharedGroup') return;

    await runRemoteOperation(
      route.shareToken,
      () => promoteGroupMemberToOwner(route.shareToken, membershipId),
      'No se pudo hacer owner.'
    );
  }

  async function handleDemoteOwner(membershipId: string) {
    if (route.kind !== 'sharedGroup') return;

    await runRemoteOperation(
      route.shareToken,
      () => demoteGroupOwnerToMember(route.shareToken, membershipId),
      'No se pudo quitar owner.'
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
          amountCents: settlement.amountCents,
          currency: settlement.currency
        }).then(() => undefined),
      'No se pudo registrar el pago.'
    );
  }

  async function handleVoidSettlementPayment(paymentId: string) {
    if (route.kind !== 'sharedGroup') return;

    await runRemoteOperation(
      route.shareToken,
      () => voidSettlementPaymentByToken(route.shareToken, paymentId).then(() => undefined),
      'No se pudo anular el pago.'
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
      <div className="cc-app min-h-screen px-4 py-6">
        <main className="cc-card mx-auto max-w-3xl">
          <p className="font-medium text-slate-800">Preparando identidad anónima...</p>
        </main>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="cc-app min-h-screen px-4 py-6">
        <main className="cc-banner cc-banner-error mx-auto max-w-3xl">
          <p className="font-medium">{authError}</p>
        </main>
      </div>
    );
  }

  if (route.kind === 'resetPassword') {
    return <ResetPasswordScreen onDone={() => navigate({ kind: 'home' }, true)} />;
  }

  if (isSupabaseConfigured && !authUserId) {
    return <AuthScreen onSignIn={handleSignIn} onSignUp={handleSignUp} onResetPassword={handleResetPasswordEmail} />;
  }

  if (isLoadingGroup) {
    return (
      <div className="cc-app min-h-screen px-4 py-6">
        <main className="cc-card mx-auto max-w-3xl">
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

  if (route.kind === 'sharedGroup' && selectedGroup && state.accessStatus === 'pending') {
    return (
      <main className="cc-app mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-6">
        <section className="cc-card p-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Cuentas Claras</p>
          <h1 className="mt-2 text-xl font-semibold">Solicitud enviada</h1>
          <p className="mt-2 text-sm">Un administrador tiene que aprobar tu acceso.</p>
          <button type="button" onClick={openHome} className="cc-button-secondary mt-4">
            Volver al inicio
          </button>
        </section>
      </main>
    );
  }

  if (route.kind === 'sharedGroup' && state.accessStatus === 'revoked') {
    return (
      <main className="cc-app mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-6">
        <section className="cc-banner cc-banner-error p-5">
          <h1 className="text-xl font-semibold">Tu acceso a este grupo fue revocado.</h1>
          <button type="button" onClick={openHome} className="cc-button-secondary mt-4">
            Volver al inicio
          </button>
        </section>
      </main>
    );
  }

  if (selectedGroup) {
    return (
      <div className="cc-app min-h-screen">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
          <GroupDetail
            group={selectedGroup}
            participants={state.participants}
            expenses={state.expenses}
            settlementCycles={state.settlementCycles}
            settlementPayments={state.settlementPayments}
            activityLogs={state.activityLogs ?? []}
            profile={profile}
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
            onVoidSettlementPayment={route.kind === 'sharedGroup' ? handleVoidSettlementPayment : undefined}
            onCloseOpenExpenses={() => handleCloseOpenExpenses(selectedGroup.id)}
            onRetry={route.kind === 'sharedGroup' ? () => refreshRemoteGroup(route.shareToken) : undefined}
            onManualRefresh={route.kind === 'sharedGroup' ? () => refreshRemoteGroup(route.shareToken, { quiet: true }) : undefined}
            onExpensePanelOpenChange={handleExpensePanelOpenChange}
            onChangeIdentity={route.kind === 'sharedGroup' ? handleChangeIdentity : undefined}
            onCreateIdentityParticipant={route.kind === 'sharedGroup' ? handleCreateIdentityParticipant : undefined}
            onRevokeMember={route.kind === 'sharedGroup' ? handleRevokeMember : undefined}
            onApproveMember={route.kind === 'sharedGroup' ? handleApproveMember : undefined}
            onRejectMember={route.kind === 'sharedGroup' ? handleRejectMember : undefined}
            onPromoteMember={route.kind === 'sharedGroup' ? handlePromoteMember : undefined}
            onDemoteOwner={route.kind === 'sharedGroup' ? handleDemoteOwner : undefined}
            onRegenerateInvite={route.kind === 'sharedGroup' ? handleRegenerateInvite : undefined}
            onUpdateMyGroupProfile={route.kind === 'sharedGroup' ? handleUpdateMyGroupProfile : undefined}
            errorMessage={detailError}
            isSaving={isSaving}
            useSharedLink={route.kind === 'sharedGroup'}
            syncStatus={syncStatus}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="cc-app min-h-screen">
      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
        <header className="pt-2">
          <p className="text-sm font-medium uppercase tracking-wide text-teal-700">Cuentas Claras</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Tus grupos</h1>
          <p className="mt-2 text-slate-600">Carga gastos, mira saldos y cerra cuentas sin vueltas.</p>
        </header>

        {!isSupabaseConfigured ? (
          <p className="cc-banner cc-banner-warning">
            Modo local activo. Para compartir grupos entre celulares configura Supabase.
          </p>
        ) : null}

        {isSupabaseConfigured ? (
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="cc-button-ghost self-start"
          >
            Cerrar sesion
          </button>
        ) : null}

        {routeMessage ? (
          <div className="cc-banner cc-banner-warning">
            <p>{routeMessage}</p>
            {route.kind === 'sharedGroup' && isSupabaseConfigured ? (
              <button type="button" onClick={() => refreshRemoteGroup(route.shareToken)} className="mt-2 font-semibold">
                Reintentar
              </button>
            ) : null}
          </div>
        ) : null}

        {isSupabaseConfigured ? <ProfileCard profile={profile} onSave={handleSaveProfile} /> : null}

        <CreateGroupForm
          onCreate={(input) => void handleCreateGroup(input)}
          requiresOwnerName={isSupabaseConfigured}
          defaultOwnerName={profile?.displayName ?? ''}
          defaultOwnerAlias={profile?.paymentAlias ?? ''}
        />
        {isSaving ? <p className="text-sm font-medium text-slate-600">Guardando cambios...</p> : null}
        {isSupabaseConfigured ? <h2 className="cc-section-title">Mis grupos</h2> : null}
        <GroupList groups={state.groups} participants={state.participants} onOpenGroup={openLocalGroup} />
      </main>
    </div>
  );
}

export default App;
