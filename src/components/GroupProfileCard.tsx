import { FormEvent, useEffect, useState } from 'react';
import type { GroupMembership, Participant, Profile } from '../types';

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
    <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">Mis datos en este grupo</h2>
          <p className="mt-2 text-sm text-slate-600">Participante asociado: {participant.name}</p>
          <p className="text-sm text-slate-600">Nombre en este grupo: {participant.name}</p>
          <p className="text-sm text-slate-600">Alias en este grupo: {participant.alias || 'Sin alias'}</p>
          <p className="text-sm text-slate-500">{sourceText}</p>
        </div>
        {onSave ? (
          <button type="button" onClick={() => setIsEditing((value) => !value)} className="text-sm font-semibold text-teal-800">
            Editar mis datos
          </button>
        ) : null}
      </div>
      {isEditing ? (
        <form onSubmit={handleSubmit} className="grid gap-3">
          {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Nombre en este grupo
            <input value={name} onChange={(event) => setName(event.target.value)} className="min-h-11 rounded-md border border-slate-300 px-3 text-base" />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={useProfileAlias} onChange={(event) => setUseProfileAlias(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Usar alias predeterminado
          </label>
          {!useProfileAlias ? (
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Alias en este grupo
              <input value={alias} onChange={(event) => setAlias(event.target.value)} className="min-h-11 rounded-md border border-slate-300 px-3 text-base" placeholder="Ej: flor.mp" />
            </label>
          ) : (
            <p className="text-sm text-slate-600">Se usara: {profile?.paymentAlias || 'Sin alias predeterminado'}</p>
          )}
          <button type="submit" className="min-h-11 rounded-md bg-teal-700 px-4 font-semibold text-white">
            Guardar cambios
          </button>
        </form>
      ) : null}
    </section>
  );
}
