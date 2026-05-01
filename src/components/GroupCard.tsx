import type { Group, Participant } from '../types';
import { formatDateTime } from '../lib/dates';

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
      className="w-full rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-teal-300 hover:shadow"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{group.name}</h2>
          <p className="mt-1 text-sm text-slate-500">Creado el {formatDateTime(group.createdAt)}</p>
        </div>
        <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-medium text-teal-800">
          {participantCount} participantes
        </span>
      </div>
    </button>
  );
}
