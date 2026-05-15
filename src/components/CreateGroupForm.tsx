import { FormEvent, useEffect, useState } from 'react';
import { Field, Icon, TextInput } from './ui';

type CreateGroupFormProps = {
  onCreate: (input: { name: string; ownerParticipantName: string; ownerParticipantAlias?: string; ownerAliasSource?: 'profile' | 'custom' }) => void;
  onCancel?: () => void;
  requiresOwnerName?: boolean;
  defaultOwnerName?: string;
  defaultOwnerAlias?: string;
};

export function CreateGroupForm({
  onCreate,
  onCancel,
  requiresOwnerName = false,
  defaultOwnerName = '',
  defaultOwnerAlias = ''
}: CreateGroupFormProps) {
  const [name, setName] = useState('');
  const [ownerParticipantName, setOwnerParticipantName] = useState(defaultOwnerName);
  const [ownerParticipantAlias, setOwnerParticipantAlias] = useState(defaultOwnerAlias);

  useEffect(() => {
    setOwnerParticipantName((current) => current || defaultOwnerName);
    setOwnerParticipantAlias((current) => current || defaultOwnerAlias);
  }, [defaultOwnerAlias, defaultOwnerName]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedOwnerName = ownerParticipantName.trim();
    if (!trimmedName) return;
    if (requiresOwnerName && !trimmedOwnerName) return;
    const aliasChanged = ownerParticipantAlias.trim() !== (defaultOwnerAlias ?? '').trim();
    onCreate({
      name: trimmedName,
      ownerParticipantName: trimmedOwnerName,
      ownerParticipantAlias: ownerParticipantAlias.trim() || undefined,
      ownerAliasSource: aliasChanged ? 'custom' : 'profile'
    });
    setName('');
  }

  return (
    <form onSubmit={handleSubmit} className="cc-card grid gap-4 p-5">
      <div className="flex items-start gap-3">
        <span className="cc-icon-tile bg-[var(--cc-primary-soft)] text-[var(--cc-primary-ink)]">
          <Icon name="plus" size={18} />
        </span>
        <div>
          <h2 className="serif text-2xl font-semibold tracking-[-0.02em] text-slate-950">Crear grupo</h2>
          <p className="cc-muted mt-1">Cena, viaje, casa compartida. Empeza con un nombre y despues invitas al resto.</p>
        </div>
      </div>
      <Field label="Nombre del grupo">
        <TextInput
          id="group-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Cena viernes, viaje, casa compartida"
        />
      </Field>
        {requiresOwnerName ? (
          <>
            <Field label="Tu nombre en este grupo">
              <TextInput
                id="owner-name"
                value={ownerParticipantName}
                onChange={(event) => setOwnerParticipantName(event.target.value)}
                placeholder="Flor"
              />
            </Field>
            <Field label={<span>Alias de pago <span className="font-normal text-slate-500">Opcional</span></span>}>
              <TextInput
                id="owner-alias"
                value={ownerParticipantAlias}
                onChange={(event) => setOwnerParticipantAlias(event.target.value)}
                placeholder="Ej: flor.mp"
              />
            </Field>
          </>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2">
          {onCancel ? (
            <button type="button" onClick={onCancel} className="cc-button-secondary">
              Cancelar
            </button>
          ) : null}
          <button type="submit" className="cc-button-primary w-full">
            Crear grupo
          </button>
        </div>
    </form>
  );
}
