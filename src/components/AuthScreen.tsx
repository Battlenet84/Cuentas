import { FormEvent, useState } from 'react';

type AuthScreenProps = {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string, profile: { displayName: string; paymentAlias?: string }) => Promise<void>;
};

export function AuthScreen({ onSignIn, onSignUp }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [paymentAlias, setPaymentAlias] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    const trimmedDisplayName = displayName.trim();

    if (!trimmedEmail) {
      setError('Ingresa tu email.');
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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-slate-50 px-4 py-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-teal-700">Cuentas Claras</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">
          {mode === 'login' ? 'Entrar' : 'Crear cuenta'}
        </h1>
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-md bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`min-h-10 rounded px-3 text-sm font-semibold ${mode === 'login' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'}`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`min-h-10 rounded px-3 text-sm font-semibold ${mode === 'signup' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'}`}
          >
            Crear cuenta
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
          {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          {mode === 'signup' ? (
            <>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Nombre
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="min-h-11 rounded-md border border-slate-300 px-3 text-base"
                  autoComplete="name"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                <span>
                  Alias de pago <span className="font-normal text-slate-500">Opcional</span>
                </span>
                <input
                  value={paymentAlias}
                  onChange={(event) => setPaymentAlias(event.target.value)}
                  className="min-h-11 rounded-md border border-slate-300 px-3 text-base"
                  placeholder="Ej: flor.mp"
                />
              </label>
            </>
          ) : null}
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="min-h-11 rounded-md border border-slate-300 px-3 text-base"
              autoComplete="email"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Contrasena
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="min-h-11 rounded-md border border-slate-300 px-3 text-base"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>
          <button
            type="submit"
            disabled={isSubmitting}
            className="min-h-11 rounded-md bg-teal-700 px-4 font-semibold text-white disabled:bg-slate-300"
          >
            {isSubmitting ? 'Procesando...' : mode === 'login' ? 'Entrar' : 'Crear mi cuenta'}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
          className="mt-4 text-sm font-semibold text-teal-800"
        >
          {mode === 'login' ? 'Crear cuenta' : 'Ya tengo cuenta'}
        </button>
      </section>
    </main>
  );
}
