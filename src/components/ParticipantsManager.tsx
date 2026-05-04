import { FormEvent, useMemo, useState } from 'react';
import type { Expense, Participant } from '../types';

type ParticipantsManagerProps = {
  groupId: string;
  participants: Participant[];
  expenses: Expense[];
  onAddParticipant: (name: string, alias?: string) => void | Promise<void>;
  onUpdateParticipant: (participant: Participant) => void | Promise<void>;
};

export function ParticipantsManager({
  groupId,
  participants,
  expenses,
  onAddParticipant,
  onUpdateParticipant
}: ParticipantsManagerProps) {
  const [name, setName] = useState('');
  const [alias, setAlias] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groupParticipants = participants.filter((participant) => participant.groupId === groupId);
  const visibleParticipants = showInactive
    ? groupParticipants
    : groupParticipants.filter((participant) => participant.isActive);

  const participantIdsWithExpenses = useMemo(() => {
    const ids = new Set<string>();
    for (const expense of expenses.filter((item) => item.groupId === groupId)) {
      if (expense.paidByParticipantId) ids.add(expense.paidByParticipantId);
      (expense.splitParticipantIds ?? []).forEach((id) => ids.add(id));
      (expense.payers ?? []).forEach((payer) => ids.add(payer.participantId));
      (expense.splits ?? []).forEach((split) => ids.add(split.participantId));
    }
    return ids;
  }, [expenses, groupId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    try {
      await onAddParticipant(trimmedName, alias.trim() || undefined);
      setName('');
      setAlias('');
      setError(null);
    } catch {
      setError('No se pudo guardar el participante.');
    }
  }

  async function handleRemove(participant: Participant) {
    const hasExpenses = participantIdsWithExpenses.has(participant.id);
    try {
      await onUpdateParticipant({ ...participant, isActive: false });
      setError(null);
      if (!hasExpenses) return;
    } catch {
      setError('No se pudo guardar el participante.');
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Participantes</h2>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(event) => setShowInactive(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Ver inactivos
        </label>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3">
        {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-h-11 rounded-md border border-slate-300 px-3"
          placeholder="Nombre"
        />
        <input
          value={alias}
          onChange={(event) => setAlias(event.target.value)}
          className="min-h-11 rounded-md border border-slate-300 px-3"
          placeholder="Alias opcional"
        />
        <button type="submit" className="min-h-11 rounded-md bg-slate-900 px-4 font-medium text-white">
          Agregar participante
        </button>
      </form>

      <div className="grid gap-2">
        {visibleParticipants.length === 0 ? (
          <p className="rounded-lg bg-white p-4 text-sm text-slate-500">Agrega participantes para empezar.</p>
        ) : (
          visibleParticipants.map((participant) => (
            <div
              key={participant.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3"
            >
              <div>
                <p className="font-medium text-slate-900">{participant.name}</p>
                <p className="text-sm text-slate-500">
                  <span>{participant.alias ? `Alias: ${participant.alias}` : 'Sin alias cargado'}</span>
                  <span> · {participant.isActive ? 'Activo' : 'Inactivo'}</span>
                </p>
              </div>
              {participant.isActive ? (
                <button
                  type="button"
                  onClick={() => handleRemove(participant)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
                >
                  Desactivar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    void Promise.resolve(onUpdateParticipant({ ...participant, isActive: true }))
                      .then(() => setError(null))
                      .catch(() => setError('No se pudo guardar el participante.'))
                  }
                  className="rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white"
                >
                  Reactivar
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
