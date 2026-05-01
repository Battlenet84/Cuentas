import { FormEvent, useState } from 'react';

type CreateGroupFormProps = {
  onCreate: (name: string) => void;
};

export function CreateGroupForm({ onCreate }: CreateGroupFormProps) {
  const [name, setName] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onCreate(trimmedName);
    setName('');
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <label className="block text-sm font-medium text-slate-700" htmlFor="group-name">
        Nombre del grupo
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          id="group-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-h-11 flex-1 rounded-md border border-slate-300 px-3 text-base"
          placeholder="Cena viernes, viaje, casa compartida"
        />
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
