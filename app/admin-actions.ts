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

function validContactEmail(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isMembershipRole(value: string): value is 'owner' | 'manager' | 'attendant' {
  return value === 'owner' || value === 'manager' || value === 'attendant';
}

function isCreatableStaffRole(value: string): value is 'owner' | 'manager' | 'attendant' {
  return value === 'owner' || value === 'manager' || value === 'attendant';
}

export async function createManagedUserAction(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireMsonjoAdmin();

  const username = field(formData, 'username').toLowerCase();
  const name = field(formData, 'name');
  const contactEmail = field(formData, 'contact_email').toLowerCase();
  const password = passwordField(formData, 'password');
  const role = field(formData, 'role');

  if (!validUsername(username)) {
    return { error: 'Username must be 3–32 characters: lowercase letters, numbers, dots, underscores, or hyphens.' };
  }
  if (name.length < 2 || name.length > 80) {
    return { error: 'Enter a name between 2 and 80 characters.' };
  }
  if (contactEmail && !validContactEmail(contactEmail)) {
    return { error: 'Enter a valid contact email address.' };
  }
  if (!validPassword(password)) {
    return { error: 'Use a password between 12 and 72 characters.' };
  }
  if (!isCreatableStaffRole(role)) {
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
    user_metadata: {
      name,
      username,
      ...(contactEmail ? { contact_email: contactEmail } : {}),
    },
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
    .upsert({
      business_id: business.id,
      user_id: created.user.id,
      role,
    }, { onConflict: 'business_id,user_id' });

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

export async function updateManagedUserRoleAction(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireMsonjoAdmin();

  const userId = field(formData, 'user_id');
  const role = field(formData, 'role');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return { error: 'Choose a valid MSONJO account.' };
  }
  if (!isMembershipRole(role)) {
    return { error: 'Choose a valid inventory role.' };
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
    .select('user_id, role')
    .eq('business_id', business.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (membershipError || !membership) {
    return { error: 'That account is not an authorized MSONJO user.' };
  }

  if (membership.role === 'owner' && role !== 'owner') {
    const { count, error: ownersError } = await admin
      .from('business_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('business_id', business.id)
      .eq('role', 'owner');

    if (ownersError) {
      return { error: 'Unable to verify MSONJO owner access. Try again.' };
    }
    if (count === 1) {
      return { error: 'Assign another user as owner before changing the last owner’s role.' };
    }
  }

  const { error: updateError } = await admin
    .from('business_members')
    .update({ role })
    .eq('business_id', business.id)
    .eq('user_id', userId);
  if (updateError) {
    return { error: 'The inventory role could not be updated.' };
  }

  revalidatePath('/staff');
  return { success: 'Inventory role updated.' };
}

export async function updateManagedUserContactEmailAction(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireMsonjoAdmin();

  const userId = field(formData, 'user_id');
  const contactEmail = field(formData, 'contact_email').toLowerCase();

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return { error: 'Choose a valid MSONJO account.' };
  }
  if (contactEmail && !validContactEmail(contactEmail)) {
    return { error: 'Enter a valid contact email address.' };
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

  const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(userId);
  if (authUserError || !authUser.user) {
    return { error: 'Unable to load that user’s Supabase Auth profile.' };
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...authUser.user.user_metadata,
      contact_email: contactEmail,
    },
  });
  if (updateError) {
    return { error: 'The contact email could not be saved to Supabase Auth.' };
  }

  revalidatePath('/staff');
  return {
    success: contactEmail
      ? 'Contact email updated in Supabase Auth user metadata. Username sign-in is unchanged.'
      : 'Contact email removed from Supabase Auth user metadata.',
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

export async function deleteManagedUserAction(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const currentUser = await requireMsonjoAdmin();
  const userId = field(formData, 'user_id');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return { error: 'Choose a valid MSONJO account.' };
  }
  if (userId === currentUser.id) {
    return { error: 'You cannot delete your own signed-in account.' };
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
    .select('role')
    .eq('business_id', business.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (membershipError || !membership) {
    return { error: 'That account is not an authorized MSONJO user.' };
  }

  if (membership.role === 'owner') {
    const { count, error: ownersError } = await admin
      .from('business_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('business_id', business.id)
      .eq('role', 'owner');
    if (ownersError) return { error: 'Unable to verify MSONJO owner access. Try again.' };
    if (count === 1) {
      return { error: 'Assign another user as owner before deleting the last owner.' };
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    return { error: 'The account could not be deleted. Verify the account and try again.' };
  }

  revalidatePath('/staff');
  return { success: 'User account deleted. Historical sales and stock records were preserved.' };
}
