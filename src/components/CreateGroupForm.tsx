import { FormEvent, useEffect, useState } from 'react';

type CreateGroupFormProps = {
  onCreate: (input: { name: string; ownerParticipantName: string; ownerParticipantAlias?: string; ownerAliasSource?: 'profile' | 'custom' }) => void;
  requiresOwnerName?: boolean;
  defaultOwnerName?: string;
  defaultOwnerAlias?: string;
};

export function CreateGroupForm({
  onCreate,
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
    <form onSubmit={handleSubmit} className="cc-card grid gap-3">
      <div>
        <h2 className="cc-section-title">Crear grupo</h2>
        <p className="cc-muted mt-1">Arma un espacio para cargar gastos y saldar cuentas.</p>
      </div>
      <label className="grid gap-1 text-sm font-medium text-slate-700" htmlFor="group-name">
        Nombre del grupo
        <input
          id="group-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="cc-input"
          placeholder="Cena viernes, viaje, casa compartida"
        />
      </label>
        {requiresOwnerName ? (
          <>
            <label className="grid gap-1 text-sm font-medium text-slate-700" htmlFor="owner-name">
              Tu nombre en este grupo
              <input
                id="owner-name"
                value={ownerParticipantName}
                onChange={(event) => setOwnerParticipantName(event.target.value)}
                className="cc-input"
                placeholder="Flor"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700" htmlFor="owner-alias">
              Alias de pago <span className="font-normal text-slate-500">Opcional</span>
              <input
                id="owner-alias"
                value={ownerParticipantAlias}
                onChange={(event) => setOwnerParticipantAlias(event.target.value)}
                className="cc-input"
                placeholder="Ej: flor.mp"
              />
            </label>
          </>
        ) : null}
        <button
          type="submit"
          className="cc-button-primary"
        >
          Crear grupo
        </button>
    </form>
  );
}
