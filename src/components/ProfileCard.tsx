import { FormEvent, useEffect, useState } from 'react';
import type { Profile } from '../types';
import { Avatar, Icon } from './ui';

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
      <div className="flex items-center gap-3">
        <Avatar name={profile?.displayName || 'Yo'} size={48} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-slate-950">{profile?.displayName || 'Mi perfil'}</h2>
          <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
            <Icon name="wallet" size={14} />
            {profile?.paymentAlias || 'Sin alias predeterminado'}
          </p>
        </div>
        <button type="button" onClick={() => setIsEditing((value) => !value)} className="cc-button-secondary min-h-9 px-3 text-xs">
          Editar
        </button>
      </div>
      {isEditing ? (
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
          {error ? <p className="cc-banner cc-banner-error">{error}</p> : null}
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
