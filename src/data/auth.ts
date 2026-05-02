import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase';

export async function getCurrentSession(): Promise<Session | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  return data.session;
}

export async function ensureAnonymousSession(): Promise<Session> {
  const supabase = getSupabaseClient();
  const currentSession = await getCurrentSession();
  if (currentSession) return currentSession;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.session) {
    throw new Error(
      error?.message ||
        'No se pudo crear la identidad anónima. Activá Anonymous sign-ins en Supabase.'
    );
  }

  return data.session;
}

export async function getCurrentUserId(): Promise<string | null> {
  const session = await getCurrentSession();
  return session?.user.id ?? null;
}
