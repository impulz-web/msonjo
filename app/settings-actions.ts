'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type SettingsFormState = {
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

export async function updateAccountNameAction(
  _state: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const name = field(formData, 'name');
  if (name.length < 2 || name.length > 80) {
    return { error: 'Enter a display name between 2 and 80 characters.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: 'Your session has expired. Sign in again to update your account.' };
  }

  const { error } = await supabase.auth.updateUser({
    data: { ...user.user_metadata, name },
  });
  if (error) {
    return { error: 'Your display name could not be updated. Try again.' };
  }

  revalidatePath('/settings');
  revalidatePath('/');
  revalidatePath('/staff');
  return { success: 'Display name updated.' };
}

export async function updateAccountPasswordAction(
  _state: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const password = passwordField(formData, 'password');
  const confirmPassword = passwordField(formData, 'confirm_password');
  if (password.length < 12 || password.length > 72) {
    return { error: 'Use a password between 12 and 72 characters.' };
  }
  if (password !== confirmPassword) {
    return { error: 'The passwords do not match.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: 'Your session has expired. Sign in again to update your password.' };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: 'Your password could not be updated. Try again.' };
  }

  revalidatePath('/settings');
  return { success: 'Password updated.' };
}
