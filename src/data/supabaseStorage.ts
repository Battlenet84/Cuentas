import type { AppState, Expense, Group, GroupDataAccess, GroupMembership, Participant, SettlementCycle } from '../types';
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

type RemoteExpense = {
  id: string;
  group_id: string;
  title: string;
  amount_cents: number;
  paid_by_participant_id: string;
  split_participant_ids: string[];
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

type RemoteMembership = {
  id: string;
  group_id: string;
  participant_id: string | null;
  auth_user_id: string;
  role: 'owner' | 'member';
  status: 'active' | 'revoked';
  joined_at: string;
  last_seen_at: string;
};

export type GroupMemberView = GroupMembership & {
  participantName: string | null;
  participantAlias: string | null;
};

type RemoteMemberView = RemoteMembership & {
  participant_name: string | null;
  participant_alias: string | null;
};

type RemoteGroupData = {
  group: RemoteGroup;
  participants?: RemoteParticipant[];
  expenses?: RemoteExpense[];
  settlementCycles?: RemoteSettlementCycle[];
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

function mapExpense(expense: RemoteExpense): Expense {
  return {
    id: expense.id,
    groupId: expense.group_id,
    title: expense.title,
    amountCents: expense.amount_cents,
    paidByParticipantId: expense.paid_by_participant_id,
    splitParticipantIds: expense.split_participant_ids,
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

function mapMemberView(member: RemoteMemberView): GroupMemberView {
  return {
    ...mapMembership(member),
    participantName: member.participant_name,
    participantAlias: member.participant_alias
  };
}

function emptyRemoteState(): AppState {
  return {
    groups: [],
    participants: [],
    expenses: [],
    settlementCycles: [],
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
  return mapGroupData(assertData(data as RemoteGroupData | null, error, 'No se pudo cargar la información del grupo.'));
}

export async function createRemoteGroup(input: { name: string; ownerParticipantName: string }): Promise<Group> {
  const client = getSupabaseClient();
  const shareToken = createShareToken();
  const { data, error } = await client.rpc('create_group_with_owner', {
    p_name: input.name,
    p_share_token: shareToken,
    p_owner_participant_name: input.ownerParticipantName
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
    p_title: input.title,
    p_amount_cents: input.amountCents,
    p_paid_by_participant_id: input.paidByParticipantId,
    p_split_participant_ids: input.splitParticipantIds,
    p_date: input.date
  });

  return mapExpense(assertData(data as RemoteExpense | null, error, 'No se pudo guardar el gasto.'));
}

export async function updateRemoteExpense(shareToken: string, expense: Expense): Promise<Expense> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('update_expense_by_token', {
    p_share_token: shareToken,
    p_expense_id: expense.id,
    p_title: expense.title,
    p_amount_cents: expense.amountCents,
    p_paid_by_participant_id: expense.paidByParticipantId,
    p_split_participant_ids: expense.splitParticipantIds,
    p_date: expense.date
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

export async function closeRemoteSettlementCycle(shareToken: string): Promise<SettlementCycle> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('close_cycle_by_token', {
    p_share_token: shareToken
  });

  return mapSettlementCycle(assertData(data as RemoteSettlementCycle | null, error, 'No se pudo cerrar el período.'));
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

export async function regenerateGroupInviteToken(shareToken: string): Promise<Group> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('regenerate_group_invite_token', {
    p_share_token: shareToken,
    p_new_share_token: createShareToken()
  });

  return mapGroup(assertData(data as RemoteGroup | null, error, 'No se pudo regenerar el link.'));
}
