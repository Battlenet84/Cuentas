import { FormEvent, useState } from 'react';
import type { GroupMembership, Participant } from '../types';

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
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Tu identidad en este grupo</h2>
          <p className="mt-1 text-sm text-slate-600">
            {currentParticipant ? `Entraste como ${currentParticipant.name}` : 'Todavía no elegiste quién sos en este grupo.'}
          </p>
        </div>
        <button type="button" onClick={() => setIsEditing((value) => !value)} className="text-sm font-semibold text-teal-800">
          Cambiar
        </button>
      </div>

      {isEditing ? (
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
          {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          <select
            value={participantId}
            onChange={(event) => setParticipantId(event.target.value)}
            className="min-h-11 rounded-md border border-slate-300 px-3 text-base"
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
                className="min-h-11 rounded-md border border-slate-300 px-3 text-base"
                placeholder="Nombre"
              />
              <input
                value={alias}
                onChange={(event) => setAlias(event.target.value)}
                className="min-h-11 rounded-md border border-slate-300 px-3 text-base"
                placeholder="Alias opcional"
              />
            </>
          ) : null}
          <button type="submit" className="min-h-11 rounded-md bg-teal-700 px-4 font-semibold text-white">
            Guardar identidad
          </button>
        </form>
      ) : null}
    </section>
  );
}
