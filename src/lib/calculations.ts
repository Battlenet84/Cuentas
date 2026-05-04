import type { Balance, Expense, ExpensePayer, ExpenseSplit, Group, Participant, Settlement, SettlementPayment } from '../types';

export function getOpenExpenses(expenses: Expense[]): Expense[] {
  return expenses.filter((expense) => !expense.settlementCycleId);
}

export function calculateBalances(
  group: Group,
  participants: Participant[],
  expenses: Expense[],
  settlementPayments: SettlementPayment[] = []
): Balance[] {
  const groupParticipants = participants.filter((participant) => participant.groupId === group.id);
  const participantIds = new Set(groupParticipants.map((participant) => participant.id));
  const balances = new Map<string, Balance>();

  for (const participant of groupParticipants) {
    balances.set(participant.id, {
      participantId: participant.id,
      paidCents: 0,
      owedCents: 0,
      balanceCents: 0
    });
  }

  for (const expense of getOpenExpenses(expenses).filter((item) => item.groupId === group.id)) {
    const payers = resolveExpensePayers(expense);
    const splits = resolveExpenseSplits(expense, participantIds);

    for (const payer of payers) {
      const payerBalance = balances.get(payer.participantId);
      if (payerBalance) payerBalance.paidCents += payer.amountCents;
    }

    for (const split of splits) {
      const participantBalance = balances.get(split.participantId);
      if (!participantBalance) continue;
      participantBalance.owedCents += split.amountCents;
    }
  }

  for (const payment of getOpenSettlementPayments(settlementPayments).filter((item) => item.groupId === group.id)) {
    const fromBalance = balances.get(payment.fromParticipantId);
    if (fromBalance) fromBalance.paidCents += payment.amountCents;

    const toBalance = balances.get(payment.toParticipantId);
    if (toBalance) toBalance.owedCents += payment.amountCents;
  }

  return Array.from(balances.values()).map((balance) => ({
    ...balance,
    balanceCents: balance.paidCents - balance.owedCents
  }));
}

export function getOpenSettlementPayments(settlementPayments: SettlementPayment[]): SettlementPayment[] {
  return settlementPayments.filter((payment) => !payment.voidedAt && !payment.settlementCycleId);
}

export function calculatePendingSettlementCents(settlements: Settlement[]): number {
  return settlements.reduce((total, settlement) => total + settlement.amountCents, 0);
}

function resolveExpensePayers(expense: Expense): ExpensePayer[] {
  if (expense.payers?.length) {
    return expense.payers.filter((payer) => payer.amountCents > 0);
  }

  if (!expense.paidByParticipantId) return [];
  return [{ participantId: expense.paidByParticipantId, amountCents: expense.amountCents }];
}

function resolveExpenseSplits(expense: Expense, participantIds: Set<string>): ExpenseSplit[] {
  if (expense.splits?.length) {
    return expense.splits.filter((split) => participantIds.has(split.participantId) && split.amountCents >= 0);
  }

  const splitIds = (expense.splitParticipantIds ?? []).filter((id) => participantIds.has(id));
  if (splitIds.length === 0) return [];

  const baseShare = Math.floor(expense.amountCents / splitIds.length);
  let remainder = expense.amountCents - baseShare * splitIds.length;

  return splitIds.map((participantId) => {
    const extraCent = remainder > 0 ? 1 : 0;
    remainder -= extraCent;
    return { participantId, amountCents: baseShare + extraCent };
  });
}

export function simplifySettlements(balances: Balance[]): Settlement[] {
  const creditors = balances
    .filter((balance) => balance.balanceCents > 0)
    .map((balance) => ({ participantId: balance.participantId, amountCents: balance.balanceCents }))
    .sort((a, b) => b.amountCents - a.amountCents);

  const debtors = balances
    .filter((balance) => balance.balanceCents < 0)
    .map((balance) => ({ participantId: balance.participantId, amountCents: Math.abs(balance.balanceCents) }))
    .sort((a, b) => b.amountCents - a.amountCents);

  const settlements: Settlement[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amountCents = Math.min(debtor.amountCents, creditor.amountCents);

    if (amountCents > 0) {
      settlements.push({
        fromParticipantId: debtor.participantId,
        toParticipantId: creditor.participantId,
        amountCents
      });
    }

    debtor.amountCents -= amountCents;
    creditor.amountCents -= amountCents;

    if (debtor.amountCents === 0) debtorIndex += 1;
    if (creditor.amountCents === 0) creditorIndex += 1;
  }

  return settlements;
}
