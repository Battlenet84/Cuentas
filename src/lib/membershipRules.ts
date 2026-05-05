import type { GroupMembership } from '../types';

export function activeOwnerCount(memberships: Pick<GroupMembership, 'role' | 'status'>[]): number {
  return memberships.filter((membership) => membership.status === 'active' && membership.role === 'owner').length;
}

export function canDemoteOwner(
  target: Pick<GroupMembership, 'role' | 'status'>,
  memberships: Pick<GroupMembership, 'role' | 'status'>[]
): boolean {
  if (target.status !== 'active' || target.role !== 'owner') return false;
  return activeOwnerCount(memberships) > 1;
}

export function isParticipantClaimedForJoin(
  participantId: string,
  memberships: Pick<GroupMembership, 'participantId' | 'status'>[]
): boolean {
  return memberships.some(
    (membership) =>
      membership.participantId === participantId &&
      (membership.status === 'active' || membership.status === 'pending')
  );
}
