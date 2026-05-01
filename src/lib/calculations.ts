import type { Balance, Expense, Group, Participant, Settlement } from '../types';

export function getOpenExpenses(expenses: Expense[]): Expense[] {
  return expenses.filter((expense) => !expense.settlementCycleId);
}

export function calculateBalances(
  group: Group,
  participants: Participant[],
  expenses: Expense[]
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
    const payerBalance = balances.get(expense.paidByParticipantId);
    if (payerBalance) {
      payerBalance.paidCents += expense.amountCents;
    }

    const splitIds = expense.splitParticipantIds.filter((id) => participantIds.has(id));
    if (splitIds.length === 0) continue;

    const baseShare = Math.floor(expense.amountCents / splitIds.length);
    let remainder = expense.amountCents - baseShare * splitIds.length;

    for (const participantId of splitIds) {
      const participantBalance = balances.get(participantId);
      if (!participantBalance) continue;

      const extraCent = remainder > 0 ? 1 : 0;
      participantBalance.owedCents += baseShare + extraCent;
      remainder -= extraCent;
    }
  }

  return Array.from(balances.values()).map((balance) => ({
    ...balance,
    balanceCents: balance.paidCents - balance.owedCents
  }));
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
