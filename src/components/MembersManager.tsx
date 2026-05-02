import { useMemo, useState } from 'react';
import type { GroupMembership } from '../types';
import type { GroupMemberView } from '../data/supabaseStorage';
import { formatDateTime } from '../lib/dates';

type MembersManagerProps = {
  members: GroupMemberView[];
  currentMembership: GroupMembership | null;
  onRevokeMember: (membershipId: string) => Promise<void>;
  onRegenerateInvite: () => Promise<void>;
};

export function MembersManager({ members, currentMembership, onRevokeMember, onRegenerateInvite }: MembersManagerProps) {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const activeMembers = members.filter((member) => member.status === 'active');
  const revokedMembers = members.filter((member) => member.status === 'revoked');
  const activeOwnerCount = activeMembers.filter((member) => member.role === 'owner').length;
  const duplicateParticipantIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const member of activeMembers) {
      if (!member.participantId) continue;
      counts.set(member.participantId, (counts.get(member.participantId) ?? 0) + 1);
    }
    return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([participantId]) => participantId));
  }, [activeMembers]);

  async function handleRevoke(member: GroupMemberView) {
    const isOnlyOwner = member.role === 'owner' && activeOwnerCount <= 1;
    if (isOnlyOwner) {
      setError('No podés revocar al único owner activo.');
      return;
    }

    const confirmed = window.confirm('Esta persona va a perder acceso a este grupo desde este dispositivo.');
    if (!confirmed) return;

    try {
      await onRevokeMember(member.id);
      setError(null);
      setMessage('Acceso revocado.');
    } catch {
      setError('No se pudo revocar el acceso.');
    }
  }

  async function handleRegenerate() {
    const confirmed = window.confirm(
      'Los links anteriores dejarán de servir para nuevas personas. Los miembros actuales mantienen acceso.'
    );
    if (!confirmed) return;

    try {
      await onRegenerateInvite();
      setError(null);
      setMessage('Link de invitación regenerado.');
    } catch {
      setError('No se pudo regenerar el link.');
    }
  }

  function memberName(member: GroupMemberView): string {
    return member.participantName ?? 'Sin participante asociado';
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Administración de miembros</h2>
        <button type="button" onClick={handleRegenerate} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800">
          Regenerar link de invitación
        </button>
      </div>
      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-md bg-teal-50 p-3 text-sm text-teal-800">{message}</p> : null}
      <div className="grid gap-2">
        {[...activeMembers, ...revokedMembers].map((member) => (
          <div key={member.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900">{memberName(member)}</p>
                <p className="text-sm text-slate-500">
                  {member.role} · {member.status} · último acceso {formatDateTime(member.lastSeenAt)}
                </p>
                {member.participantId && duplicateParticipantIds.has(member.participantId) ? (
                  <p className="mt-1 text-xs font-semibold text-amber-700">posible duplicado</p>
                ) : null}
              </div>
              {member.status === 'active' && member.id !== currentMembership?.id ? (
                <button
                  type="button"
                  onClick={() => handleRevoke(member)}
                  className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700"
                >
                  Revocar acceso
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
