import { FormEvent, useEffect, useState } from 'react';
import type { Profile } from '../types';

type ProfileCardProps = {
  profile: Profile | null;
  onSave: (input: { displayName?: string; paymentAlias?: string }) => Promise<void>;
};

export function ProfileCard({ profile, onSave }: ProfileCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [paymentAlias, setPaymentAlias] = useState(profile?.paymentAlias ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isEditing) return;
    setDisplayName(profile?.displayName ?? '');
    setPaymentAlias(profile?.paymentAlias ?? '');
  }, [isEditing, profile]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    try {
      await onSave({ displayName: displayName.trim() || undefined, paymentAlias: paymentAlias.trim() || undefined });
      setIsEditing(false);
      setError(null);
    } catch {
      setError('No se pudo guardar tu perfil.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="cc-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="cc-section-title">Mi perfil</h2>
          <p className="mt-2 text-sm text-slate-600">Nombre predeterminado: {profile?.displayName || 'Sin nombre predeterminado'}</p>
          <p className="mt-1 text-sm text-slate-600">Alias predeterminado: {profile?.paymentAlias || 'Sin alias predeterminado'}</p>
        </div>
        <button type="button" onClick={() => setIsEditing((value) => !value)} className="cc-button-ghost">
          Editar perfil
        </button>
      </div>
      {isEditing ? (
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
          {error ? <p className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Nombre predeterminado
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="cc-input" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Alias predeterminado
            <input value={paymentAlias} onChange={(event) => setPaymentAlias(event.target.value)} className="cc-input" placeholder="Ej: flor.mp" />
          </label>
          <button type="submit" disabled={isSaving} className="cc-button-primary">
            {isSaving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </form>
      ) : null}
    </section>
  );
}
