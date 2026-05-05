import { FormEvent, useEffect, useState } from 'react';
import type { GroupMembership, Participant, Profile } from '../types';
import { Avatar, Badge, SettingsBlock } from './ui';

type GroupProfileCardProps = {
  membership: GroupMembership | null;
  participants: Participant[];
  profile: Profile | null;
  onSave?: (input: { participantName: string; participantAlias?: string; useProfileAlias: boolean }) => Promise<void>;
};

export function GroupProfileCard({ membership, participants, profile, onSave }: GroupProfileCardProps) {
  const participant = participants.find((item) => item.id === membership?.participantId) ?? null;
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(participant?.name ?? '');
  const [alias, setAlias] = useState(participant?.alias ?? '');
  const [useProfileAlias, setUseProfileAlias] = useState(participant?.aliasSource === 'profile');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isEditing || !participant) return;
    setName(participant.name);
    setAlias(participant.alias ?? '');
    setUseProfileAlias(participant.aliasSource === 'profile');
  }, [isEditing, participant]);

  if (!participant) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    try {
      await onSave?.({ participantName: name.trim(), participantAlias: alias.trim() || undefined, useProfileAlias });
      setIsEditing(false);
      setError(null);
    } catch {
      setError('No se pudieron guardar tus datos.');
    }
  }

  const sourceText =
    participant.aliasSource === 'profile'
      ? 'Usa alias predeterminado'
      : participant.aliasSource === 'custom'
        ? 'Alias personalizado para este grupo'
        : 'Alias manual';

  return (
    <SettingsBlock title="Mis datos en este grupo">
      <div className="flex items-center gap-3 p-3">
        <Avatar name={participant.name} size={44} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-950">{participant.name}</p>
          <p className="mt-1 text-sm text-slate-600">Alias: {participant.alias || 'Sin alias'}</p>
          <div className="mt-1"><Badge tone="neutral">{sourceText}</Badge></div>
        </div>
        {onSave ? (
          <button type="button" onClick={() => setIsEditing((value) => !value)} className="cc-button-secondary min-h-9 px-3 text-xs">
            Editar
          </button>
        ) : null}
      </div>
      {isEditing ? (
        <form onSubmit={handleSubmit} className="grid gap-3 border-t border-slate-200 p-3">
          {error ? <p className="cc-banner cc-banner-error">{error}</p> : null}
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Nombre en este grupo
            <input value={name} onChange={(event) => setName(event.target.value)} className="cc-input" />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={useProfileAlias} onChange={(event) => setUseProfileAlias(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Usar alias predeterminado
          </label>
          {!useProfileAlias ? (
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Alias en este grupo
              <input value={alias} onChange={(event) => setAlias(event.target.value)} className="cc-input" placeholder="Ej: flor.mp" />
            </label>
          ) : (
            <p className="text-sm text-slate-600">Se usara: {profile?.paymentAlias || 'Sin alias predeterminado'}</p>
          )}
          <button type="submit" className="cc-button-primary">
            Guardar cambios
          </button>
        </form>
      ) : null}
    </SettingsBlock>
  );
}
