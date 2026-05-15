import { FormEvent, useState } from 'react';
import { Field, Logo, SegmentedControl, TextInput } from './ui';

type AuthScreenProps = {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string, profile: { displayName: string; paymentAlias?: string }) => Promise<void>;
  onResetPassword: (email: string) => Promise<void>;
};

export function AuthScreen({ onSignIn, onSignUp, onResetPassword }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'signup' | 'recovery'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [paymentAlias, setPaymentAlias] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    const trimmedDisplayName = displayName.trim();
    setSuccessMessage(null);

    if (!trimmedEmail) {
      setError('Ingresa tu email.');
      return;
    }
    if (mode === 'recovery') {
      setIsSubmitting(true);
      try {
        await onResetPassword(trimmedEmail);
        setError(null);
        setSuccessMessage('Te enviamos un email para restablecer tu contrasena.');
      } catch {
        setError('No pudimos enviar el email. Revisa el correo e intenta de nuevo.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }
    if (!password) {
      setError('Ingresa tu contrasena.');
      return;
    }
    if (password.length < 6) {
      setError('La contrasena tiene que tener al menos 6 caracteres.');
      return;
    }
    if (mode === 'signup' && !trimmedDisplayName) {
      setError('Ingresa tu nombre.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'login') await onSignIn(trimmedEmail, password);
      else await onSignUp(trimmedEmail, password, { displayName: trimmedDisplayName, paymentAlias: paymentAlias.trim() || undefined });
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo entrar.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="cc-app mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-8">
      <section className="grid gap-7">
        <header className="pt-4">
          <Logo />
          <h1 className="serif mt-7 text-[2rem] font-semibold leading-tight tracking-[-0.025em] text-slate-950">
            {mode === 'login' ? 'Bienvenido' : mode === 'signup' ? 'Crea tu cuenta' : 'Recuperar contrasena'}
          </h1>
          <p className="mt-2 max-w-sm text-[15px] leading-6 text-slate-700">
            Dividi gastos de grupos sin vueltas. Claro para cargar, simple para saldar.
          </p>
        </header>

        {mode !== 'recovery' ? (
          <SegmentedControl
            value={mode}
            onChange={(next) => {
              setMode(next);
              setError(null);
              setSuccessMessage(null);
            }}
            options={[
              { value: 'login', label: 'Entrar' },
              { value: 'signup', label: 'Crear cuenta' }
            ]}
            className="grid-cols-2"
          />
        ) : (
          <p className="text-sm text-slate-600">
            Ingresa tu email y te enviamos instrucciones para restablecer tu contrasena.
          </p>
        )}

        <form onSubmit={handleSubmit} className="cc-card grid gap-4 p-5">
          {error ? <p className="cc-banner cc-banner-error">{error}</p> : null}
          {successMessage ? <p className="cc-banner cc-banner-success">{successMessage}</p> : null}
          {mode === 'signup' ? (
            <>
              <Field label="Nombre">
                <TextInput
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoComplete="name"
                />
              </Field>
              <Field
                label={
                <span>
                  Alias de pago <span className="font-normal text-slate-500">Opcional</span>
                </span>
                }
              >
                <TextInput
                  value={paymentAlias}
                  onChange={(event) => setPaymentAlias(event.target.value)}
                  placeholder="Ej: flor.mp"
                />
              </Field>
            </>
          ) : null}
          <Field label="Email">
            <TextInput
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </Field>
          {mode !== 'recovery' ? (
          <Field label="Contrasena">
            <TextInput
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </Field>
          ) : null}
          <button type="submit" disabled={isSubmitting} className="cc-button-primary mt-1 w-full">
            {isSubmitting
              ? 'Procesando...'
              : mode === 'login'
                ? 'Entrar'
                : mode === 'signup'
                  ? 'Crear mi cuenta'
                  : 'Enviar instrucciones'}
          </button>
        </form>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
          {mode === 'login' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError(null);
                  setSuccessMessage(null);
                }}
                className="cc-button-ghost"
              >
                Crear cuenta
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('recovery');
                  setError(null);
                  setSuccessMessage(null);
                }}
                className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Olvide mi contrasena
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setSuccessMessage(null);
              }}
              className="cc-button-ghost"
            >
              {mode === 'signup' ? 'Ya tengo cuenta' : 'Volver a entrar'}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
