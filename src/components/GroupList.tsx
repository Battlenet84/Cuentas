import type { Group, Participant } from '../types';
import { EmptyState } from './EmptyState';
import { GroupCard } from './GroupCard';

type GroupListProps = {
  groups: Group[];
  participants: Participant[];
  onOpenGroup: (groupId: string) => void;
};

export function GroupList({ groups, participants, onOpenGroup }: GroupListProps) {
  if (groups.length === 0) {
    return <EmptyState icon="users" title="Todavia no tenes grupos" description="Crea uno o entra con un link de invitacion." />;
  }

  return (
    <div className="grid gap-3">
      {groups.map((group) => (
        <GroupCard key={group.id} group={group} participants={participants} onOpen={onOpenGroup} />
      ))}
    </div>
  );
}
