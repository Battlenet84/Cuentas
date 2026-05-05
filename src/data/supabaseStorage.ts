import type {
  ActivityLog,
  AppState,
  Expense,
  ExpensePayer,
  ExpenseSplit,
  Group,
  GroupDataAccess,
  GroupMembership,
  Participant,
  Profile,
  SettlementCycle,
  SettlementPayment
} from '../types';
import { getSupabaseClient } from '../lib/supabase';
import { createShareToken } from '../lib/ids';

type RemoteGroup = {
  id: string;
  name: string;
  share_token: string;
  created_at: string;
  archived_at: string | null;
};

type RemoteParticipant = {
  id: string;
  group_id: string;
  name: string;
  alias: string | null;
  is_active: boolean;
  created_at: string;
};

type RemoteExpensePayer = {
  participantId?: string;
  participant_id?: string;
  amountCents?: number;
  amount_cents?: number;
};

type RemoteExpenseSplit = RemoteExpensePayer;

type RemoteExpense = {
  id: string;
  group_id: string;
  title: string;
  amount_cents: number;
  paid_by_participant_id: string | null;
  split_participant_ids: string[] | null;
  payer_mode?: 'single' | 'multiple';
  split_mode?: 'equal' | 'manual';
  payerMode?: 'single' | 'multiple';
  splitMode?: 'equal' | 'manual';
  payers?: RemoteExpensePayer[];
  splits?: RemoteExpenseSplit[];
  date: string;
  created_at: string;
  settlement_cycle_id: string | null;
};

type RemoteSettlementCycle = {
  id: string;
  group_id: string;
  title: string;
  closed_at: string;
};

type RemoteSettlementPayment = {
  id: string;
  group_id: string;
  from_participant_id: string;
  to_participant_id: string;
  amount_cents: number;
  created_by_auth_user_id: string;
  created_at: string;
  settlement_cycle_id: string | null;
  voided_at: string | null;
};

type RemoteActivityLog = {
  id: string;
  group_id: string;
  actor_auth_user_id: string | null;
  actor_participant_id: string | null;
  actorName?: string | null;
  actor_name?: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

type RemoteMembership = {
  id: string;
  group_id: string;
  participant_id: string | null;
  auth_user_id: string;
  role: 'owner' | 'member';
  status: 'active' | 'pending' | 'revoked';
  joined_at: string;
  last_seen_at: string;
};

type RemoteProfile = {
  auth_user_id: string;
  display_name: string | null;
  payment_alias: string | null;
  created_at: string;
  updated_at: string;
};

export type GroupMemberView = GroupMembership & {
  participantName: string | null;
  participantAlias: string | null;
  requestedName?: string | null;
};

type RemoteMemberView = RemoteMembership & {
  participant_name: string | null;
  participant_alias: string | null;
  requested_name?: string | null;
};

type RemoteGroupData = {
  group: RemoteGroup;
  participants?: RemoteParticipant[];
  expenses?: RemoteExpense[];
  settlementCycles?: RemoteSettlementCycle[];
  settlementPayments?: RemoteSettlementPayment[];
  activityLogs?: RemoteActivityLog[];
  memberships?: RemoteMembership[];
  currentMembership?: RemoteMembership | null;
  accessStatus?: GroupDataAccess;
  requiresJoin?: boolean;
  accessRevoked?: boolean;
  claimedParticipantIds?: string[];
};

type RemoteMyGroup = {
  group: RemoteGroup;
  membership: RemoteMembership;
  participant: RemoteParticipant | null;
  role: 'owner' | 'member';
  last_seen_at: string;
};

type JoinResult = {
  membership: RemoteMembership;
  participant: RemoteParticipant | null;
};

function mapGroup(group: RemoteGroup): Group {
  return {
    id: group.id,
    name: group.name,
    shareToken: group.share_token,
    createdAt: group.created_at,
    archivedAt: group.archived_at
  };
}

function mapParticipant(participant: RemoteParticipant): Participant {
  return {
    id: participant.id,
    groupId: participant.group_id,
    name: participant.name,
    alias: participant.alias ?? undefined,
    isActive: participant.is_active
  };
}

function mapExpensePayer(payer: RemoteExpensePayer): ExpensePayer | null {
  const participantId = payer.participantId ?? payer.participant_id;
  const amountCents = payer.amountCents ?? payer.amount_cents;
  if (!participantId || typeof amountCents !== 'number') return null;
  return { participantId, amountCents };
}

function mapExpense(expense: RemoteExpense): Expense {
  const payers = (expense.payers ?? []).map(mapExpensePayer).filter((item): item is ExpensePayer => Boolean(item));
  const splits = (expense.splits ?? []).map(mapExpensePayer).filter((item): item is ExpenseSplit => Boolean(item));

  return {
    id: expense.id,
    groupId: expense.group_id,
    title: expense.title,
    amountCents: expense.amount_cents,
    paidByParticipantId: expense.paid_by_participant_id ?? undefined,
    splitParticipantIds: expense.split_participant_ids ?? [],
    payerMode: expense.payerMode ?? expense.payer_mode ?? 'single',
    splitMode: expense.splitMode ?? expense.split_mode ?? 'equal',
    payers,
    splits,
    date: expense.date,
    createdAt: expense.created_at,
    settlementCycleId: expense.settlement_cycle_id
  };
}

function mapSettlementCycle(cycle: RemoteSettlementCycle): SettlementCycle {
  return {
    id: cycle.id,
    groupId: cycle.group_id,
    title: cycle.title,
    closedAt: cycle.closed_at
  };
}

function mapSettlementPayment(payment: RemoteSettlementPayment): SettlementPayment {
  return {
    id: payment.id,
    groupId: payment.group_id,
    fromParticipantId: payment.from_participant_id,
    toParticipantId: payment.to_participant_id,
    amountCents: payment.amount_cents,
    createdByAuthUserId: payment.created_by_auth_user_id,
    createdAt: payment.created_at,
    settlementCycleId: payment.settlement_cycle_id,
    voidedAt: payment.voided_at
  };
}

function mapActivityLog(log: RemoteActivityLog): ActivityLog {
  return {
    id: log.id,
    groupId: log.group_id,
    actorAuthUserId: log.actor_auth_user_id,
    actorParticipantId: log.actor_participant_id,
    actorName: log.actorName ?? log.actor_name ?? null,
    action: log.action,
    entityType: log.entity_type,
    entityId: log.entity_id,
    metadata: log.metadata ?? {},
    createdAt: log.created_at
  };
}

function mapMembership(membership: RemoteMembership): GroupMembership {
  return {
    id: membership.id,
    groupId: membership.group_id,
    participantId: membership.participant_id,
    authUserId: membership.auth_user_id,
    role: membership.role,
    status: membership.status,
    joinedAt: membership.joined_at,
    lastSeenAt: membership.last_seen_at
  };
}

function mapProfile(profile: RemoteProfile): Profile {
  return {
    authUserId: profile.auth_user_id,
    displayName: profile.display_name,
    paymentAlias: profile.payment_alias,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at
  };
}

function mapMemberView(member: RemoteMemberView): GroupMemberView {
  return {
    ...mapMembership(member),
    participantName: member.participant_name,
    participantAlias: member.participant_alias,
    requestedName: member.requested_name ?? null
  };
}

function emptyRemoteState(): AppState {
  return {
    groups: [],
    participants: [],
    expenses: [],
    settlementCycles: [],
    settlementPayments: [],
    activityLogs: [],
    memberships: [],
    currentMembership: null,
    accessStatus: 'requires_join',
    claimedParticipantIds: []
  };
}

function mapGroupData(data: RemoteGroupData): AppState {
  const accessStatus =
    data.accessStatus ?? (data.accessRevoked ? 'revoked' : data.requiresJoin ? 'requires_join' : 'member');

  return {
    groups: [mapGroup(data.group)],
    participants: (data.participants ?? []).map(mapParticipant),
    expenses: (data.expenses ?? []).map(mapExpense),
    settlementCycles: (data.settlementCycles ?? []).map(mapSettlementCycle),
    settlementPayments: (data.settlementPayments ?? []).map(mapSettlementPayment),
    activityLogs: (data.activityLogs ?? []).map(mapActivityLog),
    memberships: (data.memberships ?? []).map(mapMembership),
    currentMembership: data.currentMembership ? mapMembership(data.currentMembership) : null,
    accessStatus,
    claimedParticipantIds: data.claimedParticipantIds ?? []
  };
}

function assertData<T>(data: T | null, error: { message: string } | null, fallbackMessage: string): T {
  if (error) throw new Error(error.message || fallbackMessage);
  if (!data) throw new Error(fallbackMessage);
  return data;
}

function expensePayload(expense: Omit<Expense, 'id' | 'createdAt'> | Expense) {
  return {
    p_title: expense.title,
    p_amount_cents: expense.amountCents,
    p_date: expense.date,
    p_payers: (expense.payers ?? []).map((payer) => ({
      participantId: payer.participantId,
      amountCents: payer.amountCents
    })),
    p_splits: (expense.splits ?? []).map((split) => ({
      participantId: split.participantId,
      amountCents: split.amountCents
    })),
    p_payer_mode: expense.payerMode ?? 'single',
    p_split_mode: expense.splitMode ?? 'equal'
  };
}

export async function loadMyGroups(): Promise<AppState> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('get_my_groups');
  const rows = assertData((data ?? []) as RemoteMyGroup[], error, 'No se pudieron cargar tus grupos.');

  return {
    ...emptyRemoteState(),
    groups: rows.map((row) => mapGroup(row.group)),
    memberships: rows.map((row) => mapMembership(row.membership)),
    accessStatus: 'member'
  };
}

export async function loadGroupByShareToken(shareToken: string): Promise<AppState> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('get_group_data', { p_share_token: shareToken });
  return mapGroupData(assertData(data as RemoteGroupData | null, error, 'No se pudo cargar la informacion del grupo.'));
}

export async function getMyProfile(): Promise<Profile | null> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('get_my_profile');
  if (error) throw new Error(error.message || 'No se pudo cargar tu perfil.');
  return data ? mapProfile(data as RemoteProfile) : null;
}

export async function upsertMyProfile(input: { displayName?: string; paymentAlias?: string }): Promise<Profile> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('upsert_my_profile', {
    p_display_name: input.displayName?.trim() || null,
    p_payment_alias: input.paymentAlias?.trim() || null
  });

  return mapProfile(assertData(data as RemoteProfile | null, error, 'No se pudo guardar tu perfil.'));
}

export async function createRemoteGroup(input: {
  name: string;
  ownerParticipantName: string;
  ownerParticipantAlias?: string;
}): Promise<Group> {
  const client = getSupabaseClient();
  const shareToken = createShareToken();
  const { data, error } = await client.rpc('create_group_with_owner', {
    p_name: input.name,
    p_share_token: shareToken,
    p_owner_participant_name: input.ownerParticipantName,
    p_owner_participant_alias: input.ownerParticipantAlias ?? null
  });

  return mapGroup(assertData(data as RemoteGroup | null, error, 'No se pudo crear el grupo.'));
}

export async function joinGroupByToken(
  shareToken: string,
  input: { participantId?: string | null; newParticipantName?: string; newParticipantAlias?: string }
): Promise<{ membership: GroupMembership; participant: Participant | null }> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('join_group_by_token', {
    p_share_token: shareToken,
    p_participant_id: input.participantId ?? null,
    p_new_participant_name: input.newParticipantName ?? null,
    p_new_participant_alias: input.newParticipantAlias ?? null
  });
  const result = assertData(data as JoinResult | null, error, 'No se pudo entrar al grupo.');

  return {
    membership: mapMembership(result.membership),
    participant: result.participant ? mapParticipant(result.participant) : null
  };
}

export async function updateMyGroupIdentity(shareToken: string, participantId: string): Promise<GroupMembership> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('update_my_group_identity', {
    p_share_token: shareToken,
    p_participant_id: participantId
  });

  return mapMembership(assertData(data as RemoteMembership | null, error, 'No se pudo guardar tu identidad.'));
}

export async function createRemoteParticipant(
  shareToken: string,
  input: { name: string; alias?: string }
): Promise<Participant> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('create_participant_by_token', {
    p_share_token: shareToken,
    p_name: input.name,
    p_alias: input.alias ?? null
  });

  return mapParticipant(assertData(data as RemoteParticipant | null, error, 'No se pudo guardar el participante.'));
}

export async function updateRemoteParticipant(shareToken: string, participant: Participant): Promise<Participant> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('update_participant_by_token', {
    p_share_token: shareToken,
    p_participant_id: participant.id,
    p_name: participant.name,
    p_alias: participant.alias ?? null,
    p_is_active: participant.isActive
  });

  return mapParticipant(assertData(data as RemoteParticipant | null, error, 'No se pudo guardar el participante.'));
}

export async function createRemoteExpense(
  shareToken: string,
  input: Omit<Expense, 'id' | 'createdAt'>
): Promise<Expense> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('create_expense_by_token', {
    p_share_token: shareToken,
    ...expensePayload(input)
  });

  return mapExpense(assertData(data as RemoteExpense | null, error, 'No se pudo guardar el gasto.'));
}

export async function updateRemoteExpense(shareToken: string, expense: Expense): Promise<Expense> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('update_expense_by_token', {
    p_share_token: shareToken,
    p_expense_id: expense.id,
    ...expensePayload(expense)
  });

  return mapExpense(assertData(data as RemoteExpense | null, error, 'No se pudo guardar el gasto.'));
}

export async function deleteRemoteExpense(shareToken: string, expenseId: string): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.rpc('delete_expense_by_token', {
    p_share_token: shareToken,
    p_expense_id: expenseId
  });

  if (error) throw new Error(error.message || 'No se pudo eliminar el gasto.');
}

export async function createSettlementPaymentByToken(
  shareToken: string,
  input: { fromParticipantId: string; toParticipantId: string; amountCents: number }
): Promise<SettlementPayment> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('create_settlement_payment_by_token', {
    p_share_token: shareToken,
    p_from_participant_id: input.fromParticipantId,
    p_to_participant_id: input.toParticipantId,
    p_amount_cents: input.amountCents
  });

  return mapSettlementPayment(assertData(data as RemoteSettlementPayment | null, error, 'No se pudo registrar el pago.'));
}

export async function voidSettlementPaymentByToken(shareToken: string, paymentId: string): Promise<SettlementPayment> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('void_settlement_payment_by_token', {
    p_share_token: shareToken,
    p_payment_id: paymentId
  });

  return mapSettlementPayment(assertData(data as RemoteSettlementPayment | null, error, 'No se pudo anular el pago.'));
}

export async function closeRemoteSettlementCycle(shareToken: string): Promise<SettlementCycle> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('close_cycle_by_token', {
    p_share_token: shareToken
  });

  return mapSettlementCycle(assertData(data as RemoteSettlementCycle | null, error, 'No se pudo cerrar el periodo.'));
}

export async function getGroupMembers(shareToken: string): Promise<GroupMemberView[]> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('get_group_members_by_token', { p_share_token: shareToken });
  const rows = assertData((data ?? []) as RemoteMemberView[], error, 'No se pudieron cargar los miembros.');
  return rows.map(mapMemberView);
}

export async function revokeGroupMember(shareToken: string, membershipId: string): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.rpc('revoke_group_member_by_token', {
    p_share_token: shareToken,
    p_membership_id: membershipId
  });

  if (error) throw new Error(error.message || 'No se pudo revocar el miembro.');
}

export async function approveGroupMember(shareToken: string, membershipId: string): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.rpc('approve_group_member_by_token', {
    p_share_token: shareToken,
    p_membership_id: membershipId
  });

  if (error) throw new Error(error.message || 'No se pudo aprobar el miembro.');
}

export async function rejectGroupMember(shareToken: string, membershipId: string): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.rpc('reject_group_member_by_token', {
    p_share_token: shareToken,
    p_membership_id: membershipId
  });

  if (error) throw new Error(error.message || 'No se pudo rechazar el miembro.');
}

export async function promoteGroupMemberToOwner(shareToken: string, membershipId: string): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.rpc('promote_group_member_to_owner', {
    p_share_token: shareToken,
    p_membership_id: membershipId
  });

  if (error) throw new Error(error.message || 'No se pudo hacer owner al miembro.');
}

export async function demoteGroupOwnerToMember(shareToken: string, membershipId: string): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.rpc('demote_group_owner_to_member', {
    p_share_token: shareToken,
    p_membership_id: membershipId
  });

  if (error) throw new Error(error.message || 'No se pudo quitar owner.');
}

export async function regenerateGroupInviteToken(shareToken: string): Promise<Group> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('regenerate_group_invite_token', {
    p_share_token: shareToken,
    p_new_share_token: createShareToken()
  });

  return mapGroup(assertData(data as RemoteGroup | null, error, 'No se pudo regenerar el link.'));
}
