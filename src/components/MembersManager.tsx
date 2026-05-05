import { useMemo, useState } from 'react';
import type { GroupMembership } from '../types';
import type { GroupMemberView } from '../data/supabaseStorage';
import { formatDateTime } from '../lib/dates';
import { Avatar, Badge, SettingsBlock } from './ui';

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
      {error ? <p className="cc-banner cc-banner-error">{error}</p> : null}
      {message ? <p className="cc-banner cc-banner-success">{message}</p> : null}

      <SettingsBlock title="Miembros con acceso" sub={`${activeMembers.length} activos`}>
          {activeMembers.length === 0 ? (
            <p className="p-3 text-sm text-slate-500">Todavia no hay miembros activos.</p>
          ) : (
            activeMembers.map((member) => (
              <div key={member.id} className="cc-row flex-wrap">
                <Avatar name={memberName(member)} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900">{memberName(member)}</p>
                    <Badge tone={member.role === 'owner' ? 'warning' : 'neutral'}>{member.role}</Badge>
                    {member.id === currentMembership?.id ? <Badge tone="info">Vos</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {member.participantAlias ? `Alias: ${member.participantAlias} · ` : ''}
                    Ultimo acceso {formatDateTime(member.lastSeenAt)}
                  </p>
                </div>
                {isOwner && member.id !== currentMembership?.id ? (
                  <div className="flex w-full flex-wrap gap-2 pl-12">
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
      </SettingsBlock>

      {isOwner ? (
        <SettingsBlock title="Solicitudes pendientes" sub="Personas que pidieron entrar">
            {pendingMembers.length === 0 ? (
              <p className="p-3 text-sm text-slate-500">No hay solicitudes pendientes.</p>
            ) : (
              pendingMembers.map((member) => (
                <div key={member.id} className="cc-row flex-wrap bg-[var(--cc-warning-soft)]">
                  <Avatar name={memberName(member)} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{memberName(member)}</p>
                    <p className="text-sm text-slate-500">{member.participantAlias ? `Alias: ${member.participantAlias}` : 'Sin alias cargado'}</p>
                  </div>
                  <div className="flex w-full flex-wrap gap-2 pl-12">
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
        </SettingsBlock>
      ) : null}

      {isOwner ? (
        <SettingsBlock title="Accesos revocados">
            {revokedMembers.length === 0 ? (
              <p className="p-3 text-sm text-slate-500">No hay accesos revocados.</p>
            ) : (
              revokedMembers.map((member) => (
                <div key={member.id} className="cc-row">
                  <Avatar name={memberName(member)} size={36} />
                  <div>
                    <p className="font-medium text-slate-900">{memberName(member)}</p>
                    <p className="text-sm text-slate-500">Revocado · {formatDateTime(member.lastSeenAt)}</p>
                  </div>
                </div>
              ))
            )}
        </SettingsBlock>
      ) : null}

      {isOwner && duplicateMembers.length > 0 ? (
        <div className="cc-banner cc-banner-warning">
          <h2 className="font-semibold">Posibles duplicados</h2>
          <p className="mt-1">Hay mas de una membresia activa asociada al mismo participante.</p>
        </div>
      ) : null}
    </section>
  );
}
