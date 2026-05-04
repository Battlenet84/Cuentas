import { FormEvent, useState } from 'react';
import type { Group, Participant } from '../types';

type JoinGroupCardProps = {
  group: Group;
  participants: Participant[];
  claimedParticipantIds?: string[];
  defaultName?: string;
  defaultAlias?: string;
  onJoin: (input: { participantId?: string | null; newParticipantName?: string; newParticipantAlias?: string }) => Promise<void>;
  onBack: () => void;
};

export function JoinGroupCard({
  group,
  participants,
  claimedParticipantIds = [],
  defaultName = '',
  defaultAlias = '',
  onJoin,
  onBack
}: JoinGroupCardProps) {
  const [selectedParticipantId, setSelectedParticipantId] = useState('');
  const [name, setName] = useState(defaultName);
  const [alias, setAlias] = useState(defaultAlias);
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const activeParticipants = participants.filter((participant) => participant.isActive);
  const claimedIds = new Set(claimedParticipantIds);

  async function handleExistingJoin(participantId: string) {
    setIsJoining(true);
    try {
      await onJoin({ participantId });
      setError(null);
    } catch {
      setError('No se pudo entrar al grupo.');
    } finally {
      setIsJoining(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName && !selectedParticipantId) {
      setError('Elegí quién sos o creá un participante nuevo.');
      return;
    }

    setIsJoining(true);
    try {
      if (selectedParticipantId) {
        await onJoin({ participantId: selectedParticipantId });
      } else {
        await onJoin({ newParticipantName: trimmedName, newParticipantAlias: alias.trim() || undefined });
      }
      setError(null);
    } catch {
      setError('No se pudo entrar al grupo.');
    } finally {
      setIsJoining(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 bg-slate-50 px-4 py-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-teal-700">Cuentas Claras</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Entrar a {group.name}</h1>
        <p className="mt-2 text-sm text-slate-600">Elegí quién sos en este grupo o creá un participante nuevo.</p>

        {error ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        {activeParticipants.length > 0 ? (
          <div className="mt-4 grid gap-2">
            {activeParticipants.map((participant) => (
              <button
                key={participant.id}
                type="button"
                disabled={isJoining || claimedIds.has(participant.id)}
                onClick={() => handleExistingJoin(participant.id)}
                className="min-h-11 rounded-md border border-slate-300 px-3 text-left font-medium text-slate-800 disabled:opacity-60"
              >
                {participant.name}
                {claimedIds.has(participant.id) ? (
                  <span className="ml-2 text-sm font-normal text-slate-500">Ya está asociado a otra persona.</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Crear participante nuevo
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setSelectedParticipantId('');
              }}
              className="min-h-11 rounded-md border border-slate-300 px-3 text-base"
              placeholder="Tu nombre"
            />
          </label>
          <input
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
            className="min-h-11 rounded-md border border-slate-300 px-3 text-base"
            placeholder="Alias opcional"
          />
          <button
            type="submit"
            disabled={isJoining}
            className="min-h-11 rounded-md bg-teal-700 px-4 font-semibold text-white disabled:bg-slate-300"
          >
            {isJoining ? 'Entrando...' : 'Entrar al grupo'}
          </button>
        </form>

        <button type="button" onClick={onBack} className="mt-4 text-sm font-medium text-teal-800">
          Volver al inicio
        </button>
      </section>
    </main>
  );
}
