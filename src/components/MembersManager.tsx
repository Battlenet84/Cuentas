import { useMemo, useState } from 'react';
import type { GroupMembership } from '../types';
import type { GroupMemberView } from '../data/supabaseStorage';
import { formatDateTime } from '../lib/dates';

type MembersManagerProps = {
  members: GroupMemberView[];
  currentMembership: GroupMembership | null;
  isOwner: boolean;
  onRevokeMember: (membershipId: string) => Promise<void>;
  onApproveMember?: (membershipId: string) => Promise<void>;
  onRejectMember?: (membershipId: string) => Promise<void>;
  onPromoteMember?: (membershipId: string) => Promise<void>;
  onDemoteOwner?: (membershipId: string) => Promise<void>;
};

export function MembersManager({
  members,
  currentMembership,
  isOwner,
  onRevokeMember,
  onApproveMember,
  onRejectMember,
  onPromoteMember,
  onDemoteOwner
}: MembersManagerProps) {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const activeMembers = members.filter((member) => member.status === 'active');
  const pendingMembers = members.filter((member) => member.status === 'pending');
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
  const duplicateMembers = activeMembers.filter((member) => member.participantId && duplicateParticipantIds.has(member.participantId));

  async function run(action: () => Promise<void>, success: string, failure: string) {
    try {
      await action();
      setError(null);
      setMessage(success);
    } catch {
      setError(failure);
    }
  }

  async function handleRevoke(member: GroupMemberView) {
    const isOnlyOwner = member.role === 'owner' && activeOwnerCount <= 1;
    if (isOnlyOwner) {
      setError('No podes revocar al unico owner activo.');
      return;
    }

    const confirmed = window.confirm('Esta persona va a perder acceso al grupo.');
    if (!confirmed) return;
    await run(() => onRevokeMember(member.id), 'Acceso revocado.', 'No se pudo revocar el acceso.');
  }

  async function handleDemote(member: GroupMemberView) {
    if (activeOwnerCount <= 1) {
      setError('No podes quitar owner al unico owner activo.');
      return;
    }
    await run(() => onDemoteOwner?.(member.id) ?? Promise.resolve(), 'Rol actualizado.', 'No se pudo quitar owner.');
  }

  function memberName(member: GroupMemberView): string {
    return member.participantName ?? member.requestedName ?? 'Sin participante asociado';
  }

  return (
    <section className="space-y-5">
      {error ? <p className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-xl border border-teal-100 bg-teal-50 p-3 text-sm text-teal-800">{message}</p> : null}

      <div className="space-y-2">
        <h2 className="cc-section-title">Miembros con acceso</h2>
        <div className="grid gap-2">
          {activeMembers.length === 0 ? (
            <p className="cc-card text-sm text-slate-500">Todavia no hay miembros activos.</p>
          ) : (
            activeMembers.map((member) => (
              <div key={member.id} className="cc-card-soft">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{memberName(member)}</p>
                    <p className="text-sm text-slate-500">
                      {member.participantAlias ? `Alias: ${member.participantAlias} · ` : ''}
                      {member.role} · ultimo acceso {formatDateTime(member.lastSeenAt)}
                    </p>
                  </div>
                </div>
                {isOwner && member.id !== currentMembership?.id ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {member.role === 'member' && onPromoteMember ? (
                      <button
                        type="button"
                        onClick={() => void run(() => onPromoteMember(member.id), 'Rol actualizado.', 'No se pudo hacer owner.')}
                        className="cc-button-secondary"
                      >
                        Hacer owner
                      </button>
                    ) : null}
                    {member.role === 'owner' && activeOwnerCount > 1 && onDemoteOwner ? (
                      <button
                        type="button"
                        onClick={() => void handleDemote(member)}
                        className="cc-button-secondary"
                      >
                        Quitar owner
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handleRevoke(member)}
                      className="cc-button-danger"
                    >
                      Revocar acceso
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>

      {isOwner ? (
        <div className="space-y-2">
          <h2 className="cc-section-title">Solicitudes pendientes</h2>
          <div className="grid gap-2">
            {pendingMembers.length === 0 ? (
              <p className="cc-card text-sm text-slate-500">No hay solicitudes pendientes.</p>
            ) : (
              pendingMembers.map((member) => (
                <div key={member.id} className="rounded-xl border border-amber-200 bg-white p-3 shadow-sm">
                  <p className="font-medium text-slate-900">{memberName(member)}</p>
                  <p className="text-sm text-slate-500">{member.participantAlias ? `Alias: ${member.participantAlias}` : 'Sin alias cargado'}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void run(() => onApproveMember?.(member.id) ?? Promise.resolve(), 'Solicitud aprobada.', 'No se pudo aprobar.')}
                      className="cc-button-primary"
                    >
                      Aprobar
                    </button>
                    <button
                      type="button"
                      onClick={() => void run(() => onRejectMember?.(member.id) ?? Promise.resolve(), 'Solicitud rechazada.', 'No se pudo rechazar.')}
                      className="cc-button-danger"
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {isOwner ? (
        <div className="space-y-2">
          <h2 className="cc-section-title">Accesos revocados</h2>
          <div className="grid gap-2">
            {revokedMembers.length === 0 ? (
              <p className="cc-card text-sm text-slate-500">No hay accesos revocados.</p>
            ) : (
              revokedMembers.map((member) => (
                <div key={member.id} className="cc-card-soft">
                  <p className="font-medium text-slate-900">{memberName(member)}</p>
                  <p className="text-sm text-slate-500">Revocado · {formatDateTime(member.lastSeenAt)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {isOwner && duplicateMembers.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 shadow-sm">
          <h2 className="font-semibold">Posibles duplicados</h2>
          <p className="mt-1">Hay mas de una membresia activa asociada al mismo participante.</p>
        </div>
      ) : null}
    </section>
  );
}
