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
      setError('No se pudo enviar la solicitud.');
    } finally {
      setIsJoining(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName && !selectedParticipantId) {
      setError('Elegi quien sos o crea un participante nuevo.');
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
      setError('No se pudo enviar la solicitud.');
    } finally {
      setIsJoining(false);
    }
  }

  return (
    <main className="cc-app mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-4 py-6">
      <section className="cc-card p-5">
        <p className="text-sm font-medium text-teal-700">Cuentas Claras</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Solicitar acceso a {group.name}</h1>
        <p className="mt-2 text-sm text-slate-600">Elegi quien sos en este grupo o crea un participante nuevo.</p>

        {error ? <p className="cc-banner cc-banner-error mt-4">{error}</p> : null}

        {activeParticipants.length > 0 ? (
          <div className="mt-4 grid gap-2">
            {activeParticipants.map((participant) => (
              <button
                key={participant.id}
                type="button"
                disabled={isJoining || claimedIds.has(participant.id)}
                onClick={() => handleExistingJoin(participant.id)}
                className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 text-left font-medium text-slate-800 shadow-sm disabled:opacity-60"
              >
                {participant.name}
                {claimedIds.has(participant.id) ? (
                  <span className="ml-2 text-sm font-normal text-slate-500">Ya esta asociado o pendiente.</span>
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
              className="cc-input"
              placeholder="Tu nombre"
            />
          </label>
          <input
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
            className="cc-input"
            placeholder="Alias opcional"
          />
          <button
            type="submit"
            disabled={isJoining}
            className="cc-button-primary disabled:bg-slate-300"
          >
            {isJoining ? 'Enviando...' : 'Enviar solicitud'}
          </button>
        </form>

        <button type="button" onClick={onBack} className="cc-button-ghost mt-4">
          Volver al inicio
        </button>
      </section>
    </main>
  );
}
