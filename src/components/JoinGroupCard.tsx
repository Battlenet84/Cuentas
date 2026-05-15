import { FormEvent, useState } from 'react';
import type { Group, Participant } from '../types';
import { Avatar, Field, Logo, TextInput } from './ui';

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
    <main className="cc-app mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-5 py-8">
      <header>
        <Logo />
        <h1 className="serif mt-7 text-[2rem] font-semibold leading-tight tracking-[-0.025em] text-slate-950">{group.name}</h1>
        <p className="mt-2 text-[15px] leading-6 text-slate-700">Elegi quien sos o crea un participante nuevo. Un owner tiene que aprobar tu acceso.</p>
      </header>
      <section className="cc-card p-5">

        {error ? <p className="cc-banner cc-banner-error mt-4">{error}</p> : null}

        {activeParticipants.length > 0 ? (
          <div className="mt-4 grid gap-2">
            {activeParticipants.map((participant) => (
              <button
                key={participant.id}
                type="button"
                disabled={isJoining || claimedIds.has(participant.id)}
                onClick={() => handleExistingJoin(participant.id)}
                className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 text-left font-medium text-slate-800 shadow-sm disabled:opacity-60"
              >
                <Avatar name={participant.name} size={30} />
                <span className="flex-1">{participant.name}</span>
                {claimedIds.has(participant.id) ? (
                  <span className="ml-2 text-sm font-normal text-slate-500">Ya esta asociado o pendiente.</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
          <Field label="Crear participante nuevo">
            <TextInput
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setSelectedParticipantId('');
              }}
              placeholder="Tu nombre"
            />
          </Field>
          <TextInput
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
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
