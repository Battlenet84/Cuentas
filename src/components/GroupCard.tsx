import type { Group, Participant } from '../types';
import { formatDateTime } from '../lib/dates';
import { Avatar, Icon } from './ui';

type GroupCardProps = {
  group: Group;
  participants: Participant[];
  onOpen: (groupId: string) => void;
};

export function GroupCard({ group, participants, onOpen }: GroupCardProps) {
  const participantCount = participants.filter((participant) => participant.groupId === group.id).length;

  return (
    <button
      type="button"
      onClick={() => onOpen(group.id)}
      className="cc-card w-full p-0 text-left transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md"
    >
      <div className="flex items-center gap-3 p-4">
        <Avatar name={group.name} size={44} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-slate-950">{group.name}</h2>
          <p className="mt-1 text-sm text-slate-500">{participantCount} participantes · {formatDateTime(group.createdAt)}</p>
        </div>
        <span className="cc-icon-tile h-8 w-8">
          <Icon name="arrow-r" size={15} />
        </span>
      </div>
    </button>
  );
}
