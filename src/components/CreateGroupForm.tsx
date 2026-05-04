import { FormEvent, useEffect, useState } from 'react';

type CreateGroupFormProps = {
  onCreate: (input: { name: string; ownerParticipantName: string; ownerParticipantAlias?: string }) => void;
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
    onCreate({
      name: trimmedName,
      ownerParticipantName: trimmedOwnerName,
      ownerParticipantAlias: ownerParticipantAlias.trim() || undefined
    });
    setName('');
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <label className="block text-sm font-medium text-slate-700" htmlFor="group-name">
        Nombre del grupo
      </label>
      <div className="mt-2 grid gap-2">
        <input
          id="group-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-h-11 flex-1 rounded-md border border-slate-300 px-3 text-base"
          placeholder="Cena viernes, viaje, casa compartida"
        />
        {requiresOwnerName ? (
          <>
            <label className="grid gap-1 text-sm font-medium text-slate-700" htmlFor="owner-name">
              Tu nombre en este grupo
              <input
                id="owner-name"
                value={ownerParticipantName}
                onChange={(event) => setOwnerParticipantName(event.target.value)}
                className="min-h-11 rounded-md border border-slate-300 px-3 text-base"
                placeholder="Flor"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700" htmlFor="owner-alias">
              Alias de pago <span className="font-normal text-slate-500">Opcional</span>
              <input
                id="owner-alias"
                value={ownerParticipantAlias}
                onChange={(event) => setOwnerParticipantAlias(event.target.value)}
                className="min-h-11 rounded-md border border-slate-300 px-3 text-base"
                placeholder="Ej: flor.mp"
              />
            </label>
          </>
        ) : null}
        <button
          type="submit"
          className="min-h-11 rounded-md bg-teal-700 px-4 font-medium text-white hover:bg-teal-800"
        >
          Crear grupo
        </button>
      </div>
    </form>
  );
}
