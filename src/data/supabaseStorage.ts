import type { AppState, Expense, Group, Participant, SettlementCycle } from '../types';
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

type RemoteGroupData = {
  group: RemoteGroup;
  participants: RemoteParticipant[];
  expenses: RemoteExpense[];
  settlementCycles: RemoteSettlementCycle[];
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

function mapGroupData(data: RemoteGroupData): AppState {
  return {
    groups: [mapGroup(data.group)],
    participants: data.participants.map(mapParticipant),
    expenses: data.expenses.map(mapExpense),
    settlementCycles: data.settlementCycles.map(mapSettlementCycle)
  };
}

function assertData<T>(data: T | null, error: { message: string } | null, fallbackMessage: string): T {
  if (error) throw new Error(error.message || fallbackMessage);
  if (!data) throw new Error(fallbackMessage);
  return data;
}

export async function loadGroupByShareToken(shareToken: string): Promise<AppState> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('get_group_data', { p_share_token: shareToken });
  return mapGroupData(assertData(data as RemoteGroupData | null, error, 'No se pudo cargar la información del grupo.'));
}

export async function createRemoteGroup(name: string): Promise<Group> {
  const client = getSupabaseClient();
  const shareToken = createShareToken();
  const { data, error } = await client.rpc('create_group_with_token', {
    p_name: name,
    p_share_token: shareToken
  });

  return mapGroup(assertData(data as RemoteGroup | null, error, 'No se pudo crear el grupo.'));
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
