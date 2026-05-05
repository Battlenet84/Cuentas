import { describe, expect, it } from 'vitest';
import type { GroupMembership } from '../types';
import { canDemoteOwner, isParticipantClaimedForJoin } from './membershipRules';

function membership(partial: Partial<GroupMembership>): GroupMembership {
  return {
    id: partial.id ?? 'membership_1',
    groupId: 'group_1',
    participantId: partial.participantId ?? null,
    authUserId: partial.authUserId ?? 'user_1',
    role: partial.role ?? 'member',
    status: partial.status ?? 'active',
    joinedAt: '2026-05-01T00:00:00.000Z',
    lastSeenAt: '2026-05-01T00:00:00.000Z'
  };
}

describe('membershipRules', () => {
  it('no permite quitar owner al ultimo owner activo', () => {
    const owner = membership({ role: 'owner', status: 'active' });

    expect(canDemoteOwner(owner, [owner, membership({ role: 'member' })])).toBe(false);
  });

  it('permite quitar owner cuando queda otro owner activo', () => {
    const owner = membership({ id: 'owner_1', role: 'owner', status: 'active' });
    const otherOwner = membership({ id: 'owner_2', role: 'owner', status: 'active' });

    expect(canDemoteOwner(owner, [owner, otherOwner])).toBe(true);
  });

  it('considera participantId tomado si esta active o pending', () => {
    const memberships = [
      membership({ participantId: 'flor', status: 'active' }),
      membership({ participantId: 'agus', status: 'pending' }),
      membership({ participantId: 'tomi', status: 'revoked' })
    ];

    expect(isParticipantClaimedForJoin('flor', memberships)).toBe(true);
    expect(isParticipantClaimedForJoin('agus', memberships)).toBe(true);
    expect(isParticipantClaimedForJoin('tomi', memberships)).toBe(false);
  });
});
