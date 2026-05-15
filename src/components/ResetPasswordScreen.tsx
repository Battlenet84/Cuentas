import { FormEvent, useState } from 'react';
import { updatePassword } from '../data/auth';
import { Field, Logo, TextInput } from './ui';

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
    <main className="cc-app mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-8">
      <section className="grid gap-6">
        <header>
          <Logo />
          <h1 className="serif mt-7 text-[2rem] font-semibold leading-tight tracking-[-0.025em] text-slate-950">Restablecer contrasena</h1>
          <p className="mt-2 text-[15px] leading-6 text-slate-700">Elegi una nueva contrasena para volver a entrar a la app.</p>
        </header>

        {isUpdated ? (
          <div className="cc-card grid gap-4 p-5">
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
          <form onSubmit={handleSubmit} className="cc-card grid gap-4 p-5">
            {error ? <p className="cc-banner cc-banner-error">{error}</p> : null}
            <Field label="Nueva contrasena">
              <TextInput
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Repetir contrasena">
              <TextInput
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
              />
            </Field>
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
