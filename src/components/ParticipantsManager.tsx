import { FormEvent, useMemo, useState } from 'react';
import type { Expense, Participant } from '../types';
import { Avatar, Badge, SettingsBlock } from './ui';

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAlias, setEditAlias] = useState('');
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
    try {
      await onUpdateParticipant({ ...participant, isActive: false });
      setError(null);
    } catch {
      setError('No se pudo guardar el participante.');
    }
  }

  function startEdit(participant: Participant) {
    setEditingId(participant.id);
    setEditName(participant.name);
    setEditAlias(participant.alias ?? '');
  }

  async function saveEdit(participant: Participant) {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setError('El nombre es obligatorio.');
      return;
    }

    try {
      await onUpdateParticipant({ ...participant, name: trimmedName, alias: editAlias.trim() || undefined });
      setEditingId(null);
      setError(null);
    } catch {
      setError('No se pudo guardar el participante.');
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="cc-section-h">Participantes</h2>
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
      <p className="px-1 text-sm text-slate-600">Los participantes pueden existir aunque no tengan usuario.</p>

      <form onSubmit={handleSubmit} className="cc-card grid gap-2 p-4">
        {error ? <p className="cc-banner cc-banner-error">{error}</p> : null}
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
        <button type="submit" className="cc-button-primary">
          Agregar participante
        </button>
      </form>

      <SettingsBlock title="Lista" sub={`${visibleParticipants.length} visibles`}>
        {visibleParticipants.length === 0 ? (
          <p className="p-3 text-sm text-slate-500">Agrega participantes para empezar.</p>
        ) : (
          visibleParticipants.map((participant) => (
            <div key={participant.id} className="cc-row">
              {editingId === participant.id ? (
                <div className="grid flex-1 gap-2">
                  <input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    className="cc-input"
                  />
                  <input
                    value={editAlias}
                    onChange={(event) => setEditAlias(event.target.value)}
                    className="cc-input"
                    placeholder="Alias opcional"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void saveEdit(participant)}
                      className="cc-button-primary"
                    >
                      Guardar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="cc-button-secondary"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <Avatar name={participant.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{participant.name}</p>
                    <p className="text-sm text-slate-500">
                      {participant.alias ? `Alias: ${participant.alias}` : 'Sin alias cargado'}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge tone={participant.isActive ? 'success' : 'neutral'}>{participant.isActive ? 'Activo' : 'Inactivo'}</Badge>
                      {participantIdsWithExpenses.has(participant.id) ? <Badge tone="info">Con movimientos</Badge> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(participant)}
                      className="cc-button-secondary"
                    >
                      Editar
                    </button>
                    {participant.isActive ? (
                      <button
                        type="button"
                        onClick={() => void handleRemove(participant)}
                        className="cc-button-ghost"
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
                        className="cc-button-primary"
                      >
                        Reactivar
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </SettingsBlock>
    </section>
  );
}
