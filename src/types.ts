export type Group = {
  id: string;
  name: string;
  createdAt: string;
  shareToken?: string;
  archivedAt?: string | null;
};

export type Participant = {
  id: string;
  groupId: string;
  name: string;
  alias?: string;
  isActive: boolean;
};

export type Expense = {
  id: string;
  groupId: string;
  title: string;
  amountCents: number;
  paidByParticipantId: string;
  splitParticipantIds: string[];
  date: string;
  createdAt: string;
  settlementCycleId?: string | null;
};

export type SettlementCycle = {
  id: string;
  groupId: string;
  title: string;
  closedAt: string;
};

export type Balance = {
  participantId: string;
  paidCents: number;
  owedCents: number;
  balanceCents: number;
};

export type Settlement = {
  fromParticipantId: string;
  toParticipantId: string;
  amountCents: number;
};

export type AppState = {
  groups: Group[];
  participants: Participant[];
  expenses: Expense[];
  settlementCycles: SettlementCycle[];
};
