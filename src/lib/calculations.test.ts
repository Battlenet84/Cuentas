import { describe, expect, it } from 'vitest';
import { calculateBalances, getOpenExpenses, simplifySettlements } from './calculations';
import type { Expense, Group, Participant } from '../types';

const group: Group = {
  id: 'group_1',
  name: 'Cena viernes',
  createdAt: '2026-05-01T00:00:00.000Z'
};

const participants: Participant[] = [
  { id: 'flor', groupId: group.id, name: 'Flor', isActive: true },
  { id: 'vale', groupId: group.id, name: 'Vale', isActive: true },
  { id: 'tomi', groupId: group.id, name: 'Tomi', isActive: true },
  { id: 'agus', groupId: group.id, name: 'Agus', isActive: true }
];

function expense(partial: Partial<Expense>): Expense {
  return {
    id: partial.id ?? 'expense_1',
    groupId: group.id,
    title: partial.title ?? 'Gasto',
    amountCents: partial.amountCents ?? 0,
    paidByParticipantId: partial.paidByParticipantId ?? 'flor',
    splitParticipantIds: partial.splitParticipantIds ?? [],
    date: partial.date ?? '2026-05-01',
    createdAt: partial.createdAt ?? '2026-05-01T00:00:00.000Z',
    settlementCycleId: partial.settlementCycleId ?? null
  };
}

describe('calculations', () => {
  it('divide un gasto entre todos', () => {
    const balances = calculateBalances(group, participants, [
      expense({ amountCents: 3000000, paidByParticipantId: 'flor', splitParticipantIds: ['flor', 'vale', 'tomi'] })
    ]);

    expect(balances.find((balance) => balance.participantId === 'flor')?.balanceCents).toBe(2000000);
    expect(balances.find((balance) => balance.participantId === 'vale')?.balanceCents).toBe(-1000000);
    expect(balances.find((balance) => balance.participantId === 'tomi')?.balanceCents).toBe(-1000000);
  });

  it('divide un gasto solo entre algunos aunque pague otra persona', () => {
    const balances = calculateBalances(group, participants, [
      expense({ amountCents: 2000000, paidByParticipantId: 'flor', splitParticipantIds: ['agus', 'tomi'] })
    ]);

    expect(balances.find((balance) => balance.participantId === 'flor')?.balanceCents).toBe(2000000);
    expect(balances.find((balance) => balance.participantId === 'agus')?.balanceCents).toBe(-1000000);
    expect(balances.find((balance) => balance.participantId === 'tomi')?.balanceCents).toBe(-1000000);
  });

  it('identifica persona que pagó de más y persona que debe', () => {
    const balances = calculateBalances(group, participants, [
      expense({ amountCents: 1200000, paidByParticipantId: 'vale', splitParticipantIds: ['flor', 'vale', 'tomi'] })
    ]);

    expect(balances.find((balance) => balance.participantId === 'vale')?.balanceCents).toBe(800000);
    expect(balances.find((balance) => balance.participantId === 'flor')?.balanceCents).toBe(-400000);
  });

  it('simplifica transferencias', () => {
    const settlements = simplifySettlements([
      { participantId: 'flor', paidCents: 0, owedCents: 0, balanceCents: 1500000 },
      { participantId: 'vale', paidCents: 0, owedCents: 0, balanceCents: 500000 },
      { participantId: 'tomi', paidCents: 0, owedCents: 0, balanceCents: -2000000 }
    ]);

    expect(settlements).toEqual([
      { fromParticipantId: 'tomi', toParticipantId: 'flor', amountCents: 1500000 },
      { fromParticipantId: 'tomi', toParticipantId: 'vale', amountCents: 500000 }
    ]);
  });

  it('excluye gastos cerrados del balance actual', () => {
    const expenses = [
      expense({ id: 'open', amountCents: 3000000, paidByParticipantId: 'flor', splitParticipantIds: ['flor', 'vale'] }),
      expense({
        id: 'closed',
        amountCents: 9000000,
        paidByParticipantId: 'vale',
        splitParticipantIds: ['flor', 'vale'],
        settlementCycleId: 'settlement_1'
      })
    ];

    const balances = calculateBalances(group, participants, expenses);

    expect(getOpenExpenses(expenses)).toHaveLength(1);
    expect(balances.find((balance) => balance.participantId === 'flor')?.balanceCents).toBe(1500000);
    expect(balances.find((balance) => balance.participantId === 'vale')?.balanceCents).toBe(-1500000);
  });
});
