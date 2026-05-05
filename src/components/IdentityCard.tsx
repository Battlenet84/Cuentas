import { FormEvent, useState } from 'react';
import type { GroupMembership, Participant } from '../types';
import { Avatar, SettingsBlock } from './ui';

type IdentityCardProps = {
  membership: GroupMembership | null;
  participants: Participant[];
  onChangeIdentity: (participantId: string) => Promise<void>;
  onCreateParticipant: (name: string, alias?: string) => Promise<void>;
};

export function IdentityCard({ membership, participants, onChangeIdentity, onCreateParticipant }: IdentityCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [participantId, setParticipantId] = useState(membership?.participantId ?? '');
  const [name, setName] = useState('');
  const [alias, setAlias] = useState('');
  const [error, setError] = useState<string | null>(null);
  const currentParticipant = participants.find((participant) => participant.id === membership?.participantId);
  const activeParticipants = participants.filter((participant) => participant.isActive);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (participantId) {
        await onChangeIdentity(participantId);
      } else if (name.trim()) {
        await onCreateParticipant(name.trim(), alias.trim() || undefined);
      } else {
        setError('Elegí un participante o creá uno nuevo.');
        return;
      }
      setIsEditing(false);
      setError(null);
      setName('');
      setAlias('');
    } catch {
      setError('No se pudo guardar tu identidad.');
    }
  }

  return (
    <SettingsBlock title="Mi identidad">
      <div className="flex items-center gap-3 p-3">
        <Avatar name={currentParticipant?.name || 'Yo'} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-950">
            {currentParticipant ? `Entraste como ${currentParticipant.name}` : 'Todavía no elegiste quién sos en este grupo.'}
          </p>
          {currentParticipant?.alias ? <p className="mt-1 text-sm text-slate-500">Alias: {currentParticipant.alias}</p> : null}
        </div>
        <button type="button" onClick={() => setIsEditing((value) => !value)} className="cc-button-secondary min-h-9 px-3 text-xs">
          Cambiar
        </button>
      </div>

      {isEditing ? (
        <form onSubmit={handleSubmit} className="grid gap-3 border-t border-slate-200 p-3">
          {error ? <p className="cc-banner cc-banner-error">{error}</p> : null}
          <select
            value={participantId}
            onChange={(event) => setParticipantId(event.target.value)}
            className="cc-input"
          >
            <option value="">Crear nuevo participante</option>
            {activeParticipants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participant.name}
              </option>
            ))}
          </select>
          {!participantId ? (
            <>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="cc-input"
                placeholder="Nombre"
              />
              <input
                value={alias}
                onChange={(event) => setAlias(event.target.value)}
                className="cc-input"
                placeholder="Alias opcional"
              />
            </>
          ) : null}
          <button type="submit" className="cc-button-primary">
            Guardar identidad
          </button>
        </form>
      ) : null}
    </SettingsBlock>
  );
}
