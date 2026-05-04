import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase';

function normalizeAuthError(message?: string): string {
  const text = message?.toLowerCase() ?? '';
  if (text.includes('already registered') || text.includes('already exists') || text.includes('user already')) {
    return 'Ya existe una cuenta con ese email.';
  }
  if (text.includes('invalid login') || text.includes('invalid credentials')) {
    return 'Email o contraseña incorrectos.';
  }
  if (text.includes('email not confirmed')) {
    return 'La cuenta fue creada, pero Supabase está pidiendo confirmar el email. Desactivá Email confirmations en Supabase para este MVP.';
  }
  return message || 'No se pudo completar la operación.';
}

export async function signUpWithEmail(email: string, password: string): Promise<Session | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(normalizeAuthError(error.message));
  if (!data.session) {
    throw new Error(
      'La cuenta fue creada, pero Supabase está pidiendo confirmar el email. Desactivá Email confirmations en Supabase para este MVP.'
    );
  }
  return data.session;
}

export async function signInWithEmail(email: string, password: string): Promise<Session> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(normalizeAuthError(error?.message));
  return data.session;
}

export async function signOut(): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function resetPasswordForEmail(email: string, redirectTo: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw new Error(error.message);
}

export async function updatePassword(newPassword: string): Promise<User> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.updateUser({ password: newPassword });
  if (error || !data.user) throw new Error(error?.message || 'No se pudo actualizar la contrasena.');
  return data.user;
}

export async function getCurrentSession(): Promise<Session | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  return data.session;
}

export async function getCurrentUser(): Promise<User | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  return data.user;
}

export function listenToAuthChanges(callback: (event: AuthChangeEvent, session: Session | null) => void): () => void {
  const supabase = getSupabaseClient();
  const { data } = supabase.auth.onAuthStateChange(callback);
  return () => data.subscription.unsubscribe();
}
