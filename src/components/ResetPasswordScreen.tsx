import { FormEvent, useState } from 'react';
import { updatePassword } from '../data/auth';

type ResetPasswordScreenProps = {
  onDone: () => void;
};

export function ResetPasswordScreen({ onDone }: ResetPasswordScreenProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUpdated, setIsUpdated] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!password) {
      setError('Ingresa tu nueva contrasena.');
      return;
    }
    if (password.length < 6) {
      setError('La contrasena tiene que tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contrasenas no coinciden.');
      return;
    }

    setIsSubmitting(true);
    try {
      await updatePassword(password);
      setError(null);
      setIsUpdated(true);
    } catch {
      setError('No pudimos actualizar la contrasena. Volve a pedir el email de recuperacion.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="cc-app mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-6">
      <section className="cc-card p-5">
        <p className="text-sm font-medium text-teal-700">Cuentas Claras</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Restablecer contrasena</h1>

        {isUpdated ? (
          <div className="mt-4 grid gap-4">
            <p className="cc-banner cc-banner-success">
              Contrasena actualizada correctamente.
            </p>
            <button
              type="button"
              onClick={onDone}
              className="cc-button-primary"
            >
              Ir a la app
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
            {error ? <p className="cc-banner cc-banner-error">{error}</p> : null}
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Nueva contrasena
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="cc-input"
                autoComplete="new-password"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Repetir contrasena
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="cc-input"
                autoComplete="new-password"
              />
            </label>
            <button
              type="submit"
              disabled={isSubmitting}
              className="cc-button-primary disabled:bg-slate-300"
            >
              {isSubmitting ? 'Guardando...' : 'Guardar nueva contrasena'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
