import { useMemo, useState } from 'react';
import type { GroupMembership } from '../types';
import type { GroupMemberView } from '../data/supabaseStorage';
import { formatDateTime } from '../lib/dates';
import { Avatar, Badge, SettingsBlock } from './ui';
import { ConfirmDialog } from './ConfirmDialog';
import { EmptyState } from './EmptyState';

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
  const [confirmAction, setConfirmAction] = useState<null | {
    title: string;
    description: string;
    confirmLabel: string;
    tone?: 'default' | 'danger';
    action: () => Promise<void>;
  }>(null);
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

    setConfirmAction({
      title: 'Revocar acceso',
      description: 'Esta persona va a perder acceso al grupo.',
      confirmLabel: 'Revocar acceso',
      tone: 'danger',
      action: () => run(() => onRevokeMember(member.id), 'Acceso revocado.', 'No se pudo revocar el acceso.')
    });
  }

  async function handleDemote(member: GroupMemberView) {
    if (activeOwnerCount <= 1) {
      setError('No podes quitar owner al unico owner activo.');
      return;
    }
    await run(() => onDemoteOwner?.(member.id) ?? Promise.resolve(), 'Rol actualizado.', 'No se pudo quitar owner.');
  }

  function handleReject(member: GroupMemberView) {
    setConfirmAction({
      title: 'Rechazar solicitud',
      description: 'La solicitud se rechazara y la persona no podra entrar con este pedido.',
      confirmLabel: 'Rechazar',
      tone: 'danger',
      action: () => run(() => onRejectMember?.(member.id) ?? Promise.resolve(), 'Solicitud rechazada.', 'No se pudo rechazar.')
    });
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
            <div className="p-3">
              <EmptyState icon="users" title="Sin miembros activos" description="Cuando alguien tenga acceso aprobado, va a aparecer aca." />
            </div>
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
              <div className="p-3">
                <EmptyState icon="check" title="Sin solicitudes pendientes" description="No hay personas esperando aprobacion." />
              </div>
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
                      onClick={() => handleReject(member)}
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
              <div className="p-3">
                <EmptyState icon="lock" title="Sin accesos revocados" description="Los accesos revocados van a aparecer aca." />
              </div>
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
      <ConfirmDialog
        isOpen={Boolean(confirmAction)}
        title={confirmAction?.title ?? ''}
        description={confirmAction?.description ?? ''}
        confirmLabel={confirmAction?.confirmLabel ?? 'Confirmar'}
        tone={confirmAction?.tone}
        onConfirm={async () => {
          const action = confirmAction?.action;
          setConfirmAction(null);
          await action?.();
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </section>
  );
}
