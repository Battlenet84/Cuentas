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

export type ExpensePayer = {
  participantId: string;
  amountCents: number;
};

export type ExpenseSplit = {
  participantId: string;
  amountCents: number;
};

export type Expense = {
  id: string;
  groupId: string;
  title: string;
  amountCents: number;
  paidByParticipantId?: string;
  splitParticipantIds?: string[];
  payerMode?: 'single' | 'multiple';
  splitMode?: 'equal' | 'manual';
  payers?: ExpensePayer[];
  splits?: ExpenseSplit[];
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

export type SettlementPayment = {
  id: string;
  groupId: string;
  fromParticipantId: string;
  toParticipantId: string;
  amountCents: number;
  createdByAuthUserId: string;
  createdAt: string;
  settlementCycleId?: string | null;
  voidedAt?: string | null;
};

export type Profile = {
  authUserId: string;
  displayName?: string | null;
  paymentAlias?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GroupMembership = {
  id: string;
  groupId: string;
  participantId: string | null;
  authUserId: string;
  role: 'owner' | 'member';
  status: 'active' | 'revoked';
  joinedAt: string;
  lastSeenAt: string;
};

export type GroupDataAccess = 'member' | 'requires_join' | 'revoked';

export type AppState = {
  groups: Group[];
  participants: Participant[];
  expenses: Expense[];
  settlementCycles: SettlementCycle[];
  settlementPayments: SettlementPayment[];
  memberships?: GroupMembership[];
  currentMembership?: GroupMembership | null;
  accessStatus?: GroupDataAccess;
  claimedParticipantIds?: string[];
};
