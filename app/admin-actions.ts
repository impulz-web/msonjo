'use server';

import { revalidatePath } from 'next/cache';
import { requireMsonjoAdmin, createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getMsonjoAuthEmail } from '@/lib/supabase/auth-identity';

type AdminFormState = {
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

function validUsername(username: string) {
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(username);
}

function validPassword(password: string) {
  return password.length >= 12 && password.length <= 72;
}

function isMembershipRole(value: string): value is 'owner' | 'manager' | 'attendant' {
  return value === 'owner' || value === 'manager' || value === 'attendant';
}

export async function createManagedUserAction(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireMsonjoAdmin();

  const username = field(formData, 'username').toLowerCase();
  const name = field(formData, 'name');
  const password = passwordField(formData, 'password');
  const role = field(formData, 'role');

  if (!validUsername(username)) {
    return { error: 'Username must be 3–32 characters: lowercase letters, numbers, dots, underscores, or hyphens.' };
  }
  if (name.length < 2 || name.length > 80) {
    return { error: 'Enter a name between 2 and 80 characters.' };
  }
  if (!validPassword(password)) {
    return { error: 'Use a password between 12 and 72 characters.' };
  }
  if (!isMembershipRole(role)) {
    return { error: 'Choose a valid inventory role.' };
  }

  const supabaseUrl = process.env.MSONJO_SUPABASE_URL;
  if (!supabaseUrl) {
    return { error: 'MSONJO_SUPABASE_URL is required to create managed accounts.' };
  }

  const admin = createSupabaseAdminClient();
  const { data: business, error: businessError } = await admin
    .from('businesses')
    .select('id')
    .eq('slug', 'msonjo-gas-house-hold')
    .maybeSingle();

  if (businessError || !business) {
    return { error: 'The MSONJO business could not be loaded. Verify the database migration.' };
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: getMsonjoAuthEmail(username, supabaseUrl),
    password,
    email_confirm: true,
    user_metadata: { name, username },
    app_metadata: { role: 'user', username },
  });

  if (createError || !created.user) {
    if (createError?.code === 'email_exists') {
      return { error: 'That username is already in use.' };
    }
    return { error: 'The account could not be created. Verify the Supabase Auth configuration and try again.' };
  }

  const { error: membershipError } = await admin
    .from('business_members')
    .insert({
      business_id: business.id,
      user_id: created.user.id,
      role,
    });

  if (membershipError) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(created.user.id);
    if (deleteError) {
      return {
        error: 'The Auth account was created but could not be granted inventory access or rolled back. Remove the incomplete account in Supabase Auth.',
      };
    }
    return { error: 'The account was rolled back because MSONJO inventory access could not be assigned.' };
  }

  revalidatePath('/staff');
  return {
    success: `Created ${username}. The password is only available in this open form; it is not saved for later viewing.`,
  };
}

export async function resetManagedUserPasswordAction(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireMsonjoAdmin();

  const userId = field(formData, 'user_id');
  const password = passwordField(formData, 'password');

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return { error: 'Choose a valid MSONJO account.' };
  }
  if (!validPassword(password)) {
    return { error: 'Use a password between 12 and 72 characters.' };
  }

  const admin = createSupabaseAdminClient();
  const { data: business, error: businessError } = await admin
    .from('businesses')
    .select('id')
    .eq('slug', 'msonjo-gas-house-hold')
    .maybeSingle();
  if (businessError || !business) {
    return { error: 'The MSONJO business could not be loaded. Verify the database migration.' };
  }
  const { data: membership, error: membershipError } = await admin
    .from('business_members')
    .select('user_id')
    .eq('business_id', business.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (membershipError || !membership) {
    return { error: 'That account is not an authorized MSONJO user.' };
  }

  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) {
    return { error: 'The password could not be reset. Verify the account and try again.' };
  }

  revalidatePath('/staff');
  return {
    success: 'Password reset. Copy the new password from this form now; it cannot be retrieved later.',
  };
}
