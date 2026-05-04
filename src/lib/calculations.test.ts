import { describe, expect, it } from 'vitest';
import { calculateBalances, getOpenExpenses, simplifySettlements } from './calculations';
import type { Expense, Group, Participant, SettlementPayment } from '../types';

const group: Group = {
  id: 'group_1',
  name: 'Cena viernes',
  createdAt: '2026-05-01T00:00:00.000Z'
};

const participants: Participant[] = [
  { id: 'flor', groupId: group.id, name: 'Flor', isActive: true },
  { id: 'agus', groupId: group.id, name: 'Agus', isActive: true },
  { id: 'tomi', groupId: group.id, name: 'Tomi', isActive: true },
  { id: 'vale', groupId: group.id, name: 'Vale', isActive: true }
];

function expense(partial: Partial<Expense>): Expense {
  return {
    id: partial.id ?? 'expense_1',
    groupId: group.id,
    title: partial.title ?? 'Gasto',
    amountCents: partial.amountCents ?? 0,
    paidByParticipantId: partial.paidByParticipantId,
    splitParticipantIds: partial.splitParticipantIds,
    payerMode: partial.payerMode,
    splitMode: partial.splitMode,
    payers: partial.payers,
    splits: partial.splits,
    date: partial.date ?? '2026-05-01',
    createdAt: partial.createdAt ?? '2026-05-01T00:00:00.000Z',
    settlementCycleId: partial.settlementCycleId ?? null
  };
}

function payment(partial: Partial<SettlementPayment>): SettlementPayment {
  return {
    id: partial.id ?? 'payment_1',
    groupId: group.id,
    fromParticipantId: partial.fromParticipantId ?? 'agus',
    toParticipantId: partial.toParticipantId ?? 'flor',
    amountCents: partial.amountCents ?? 0,
    createdByAuthUserId: 'user_1',
    createdAt: '2026-05-01T00:00:00.000Z',
    voidedAt: partial.voidedAt ?? null
  };
}

function balanceOf(participantId: string, balances = calculateBalances(group, participants, [])) {
  return balances.find((balance) => balance.participantId === participantId)?.balanceCents;
}

describe('calculations', () => {
  it('calcula gasto igualitario con una persona que paga', () => {
    const balances = calculateBalances(group, participants, [
      expense({
        amountCents: 4000000,
        payers: [{ participantId: 'flor', amountCents: 4000000 }],
        splits: participants.map((participant) => ({ participantId: participant.id, amountCents: 1000000 })),
        payerMode: 'single',
        splitMode: 'equal'
      })
    ]);

    expect(balanceOf('flor', balances)).toBe(3000000);
    expect(balanceOf('agus', balances)).toBe(-1000000);
    expect(balanceOf('tomi', balances)).toBe(-1000000);
    expect(balanceOf('vale', balances)).toBe(-1000000);
  });

  it('calcula gasto igualitario con varias personas que pagan', () => {
    const balances = calculateBalances(group, participants, [
      expense({
        amountCents: 5000000,
        payers: [
          { participantId: 'flor', amountCents: 3000000 },
          { participantId: 'agus', amountCents: 2000000 }
        ],
        splits: participants.map((participant) => ({ participantId: participant.id, amountCents: 1250000 })),
        payerMode: 'multiple',
        splitMode: 'equal'
      })
    ]);

    expect(balanceOf('flor', balances)).toBe(1750000);
    expect(balanceOf('agus', balances)).toBe(750000);
    expect(balanceOf('tomi', balances)).toBe(-1250000);
    expect(balanceOf('vale', balances)).toBe(-1250000);
  });

  it('calcula gasto manual desigual con una persona que paga', () => {
    const balances = calculateBalances(group, participants, [
      expense({
        amountCents: 4000000,
        payers: [{ participantId: 'flor', amountCents: 4000000 }],
        splits: [
          { participantId: 'flor', amountCents: 1500000 },
          { participantId: 'agus', amountCents: 1000000 },
          { participantId: 'tomi', amountCents: 1000000 },
          { participantId: 'vale', amountCents: 500000 }
        ],
        splitMode: 'manual'
      })
    ]);

    expect(balanceOf('flor', balances)).toBe(2500000);
    expect(balanceOf('vale', balances)).toBe(-500000);
  });

  it('calcula gasto manual desigual con varias personas que pagan', () => {
    const balances = calculateBalances(group, participants, [
      expense({
        amountCents: 10000000,
        payers: [
          { participantId: 'flor', amountCents: 7000000 },
          { participantId: 'agus', amountCents: 3000000 }
        ],
        splits: [
          { participantId: 'flor', amountCents: 5000000 },
          { participantId: 'agus', amountCents: 2000000 },
          { participantId: 'tomi', amountCents: 3000000 }
        ],
        payerMode: 'multiple',
        splitMode: 'manual'
      })
    ]);

    expect(balanceOf('flor', balances)).toBe(2000000);
    expect(balanceOf('agus', balances)).toBe(1000000);
    expect(balanceOf('tomi', balances)).toBe(-3000000);
  });

  it('registra pago individual y reduce la deuda', () => {
    const expenses = [
      expense({
        amountCents: 2000000,
        payers: [{ participantId: 'flor', amountCents: 2000000 }],
        splits: [
          { participantId: 'flor', amountCents: 1000000 },
          { participantId: 'agus', amountCents: 1000000 }
        ]
      })
    ];

    const before = simplifySettlements(calculateBalances(group, participants, expenses));
    const after = simplifySettlements(calculateBalances(group, participants, expenses, [
      payment({ fromParticipantId: 'agus', toParticipantId: 'flor', amountCents: 1000000 })
    ]));

    expect(before).toEqual([{ fromParticipantId: 'agus', toParticipantId: 'flor', amountCents: 1000000 }]);
    expect(after).toEqual([]);
  });

  it('mantiene compatibilidad con gasto viejo', () => {
    const expenses = [
      expense({
        id: 'old',
        amountCents: 3000000,
        paidByParticipantId: 'flor',
        splitParticipantIds: ['flor', 'agus', 'tomi']
      }),
      expense({
        id: 'closed',
        amountCents: 9000000,
        paidByParticipantId: 'agus',
        splitParticipantIds: ['flor', 'agus'],
        settlementCycleId: 'settlement_1'
      })
    ];

    const balances = calculateBalances(group, participants, expenses);

    expect(getOpenExpenses(expenses)).toHaveLength(1);
    expect(balanceOf('flor', balances)).toBe(2000000);
    expect(balanceOf('agus', balances)).toBe(-1000000);
    expect(balanceOf('tomi', balances)).toBe(-1000000);
  });

  it('salda un settlement generado por un gasto viejo', () => {
    const expenses = [
      expense({
        id: 'old',
        amountCents: 2000000,
        paidByParticipantId: 'flor',
        splitParticipantIds: ['flor', 'agus']
      })
    ];

    const before = simplifySettlements(calculateBalances(group, participants, expenses));
    const after = simplifySettlements(calculateBalances(group, participants, expenses, [
      payment({ fromParticipantId: 'agus', toParticipantId: 'flor', amountCents: 1000000 })
    ]));

    expect(before).toEqual([{ fromParticipantId: 'agus', toParticipantId: 'flor', amountCents: 1000000 }]);
    expect(after).toEqual([]);
  });
});
