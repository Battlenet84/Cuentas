export type CurrencyCode = 'ARS' | 'USD' | 'EUR' | 'BRL' | 'UYU' | 'CLP';

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
  aliasSource?: 'profile' | 'custom' | 'manual';
  isActive: boolean;
};

export type ExpensePayer = {
  participantId: string;
  amountCents: number;
  percentage?: number | null;
};

export type ExpenseSplit = {
  participantId: string;
  amountCents: number;
  percentage?: number | null;
};

export type Expense = {
  id: string;
  groupId: string;
  title: string;
  amountCents: number;
  currency: CurrencyCode;
  paidByParticipantId?: string;
  splitParticipantIds?: string[];
  payerMode?: 'single' | 'multiple';
  splitMode?: 'equal' | 'manual' | 'percentage';
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
  currency?: CurrencyCode;
  paidCents: number;
  owedCents: number;
  balanceCents: number;
};

export type Settlement = {
  fromParticipantId: string;
  toParticipantId: string;
  amountCents: number;
  currency: CurrencyCode;
};

export type SettlementPayment = {
  id: string;
  groupId: string;
  fromParticipantId: string;
  toParticipantId: string;
  amountCents: number;
  currency: CurrencyCode;
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

export type ActivityLog = {
  id: string;
  groupId: string;
  actorAuthUserId?: string | null;
  actorParticipantId?: string | null;
  actorName?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type GroupMembership = {
  id: string;
  groupId: string;
  participantId: string | null;
  authUserId: string;
  role: 'owner' | 'member';
  status: 'active' | 'pending' | 'revoked';
  joinedAt: string;
  lastSeenAt: string;
};

export type GroupDataAccess = 'member' | 'requires_join' | 'pending' | 'revoked';

export type AppState = {
  groups: Group[];
  participants: Participant[];
  expenses: Expense[];
  settlementCycles: SettlementCycle[];
  settlementPayments: SettlementPayment[];
  activityLogs?: ActivityLog[];
  memberships?: GroupMembership[];
  currentMembership?: GroupMembership | null;
  accessStatus?: GroupDataAccess;
  claimedParticipantIds?: string[];
};
