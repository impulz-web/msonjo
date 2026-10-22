'use server';

import { redirect } from 'next/navigation';
import { getAuthorizedBusinesses } from '@/lib/bizzflow/businesses';
import { getMsonjoAuthEmail } from '@/lib/supabase/auth-identity';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type FormState = {
  error?: string;
  success?: string;
};

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function passwordField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

async function hasMsonjoAccess(userId: string) {
  const supabase = await createSupabaseServerClient();
  const businesses = await getAuthorizedBusinesses(supabase, userId);
  return businesses.length > 0;
}

export async function loginAction(_state: FormState, formData: FormData): Promise<FormState> {
  const identifier = field(formData, 'identifier').toLowerCase();
  const password = passwordField(formData, 'password');

  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
  const isUsername = /^[a-z0-9][a-z0-9._-]{2,31}$/.test(identifier);
  if ((!isEmail && !isUsername) || password.length < 1) {
    return { error: 'Enter a valid email or username and your password.' };
  }

  const supabase = await createSupabaseServerClient();
  const projectUrl = process.env.MSONJO_SUPABASE_URL;
  if (!projectUrl) {
    redirect('/configuration');
  }
  const loginEmail = isEmail
    ? identifier
    : getMsonjoAuthEmail(identifier, projectUrl);
  const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });

  if (error || !data.user) {
    return { error: 'We could not sign you in. Check your email and password and try again.' };
  }

  let hasAccess: boolean;
  try {
    hasAccess = await hasMsonjoAccess(data.user.id);
  } catch (loadError) {
    if (loadError instanceof Error && loadError.name === 'BusinessAccessError') {
      redirect('/configuration?issue=database');
    }
    throw loadError;
  }
  redirect(hasAccess ? '/dashboard' : '/configuration?issue=access');
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error('Unable to sign out. Please try again.');
  }

  redirect('/login');
}
