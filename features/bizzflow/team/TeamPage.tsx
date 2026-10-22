import InventoryPageHeader from '../shared/InventoryPageHeader';
import AdminUserPanel from './AdminUserPanel';
import { createSupabaseAdminClient, requireMsonjoAdmin } from '@/lib/supabase/admin';

export default async function TeamPage() {
  await requireMsonjoAdmin();
  const admin = createSupabaseAdminClient();

  const { data: business, error: businessError } = await admin
    .from('businesses')
    .select('id')
    .eq('slug', 'msonjo-gas-house-hold')
    .maybeSingle();

  if (businessError || !business) {
    throw new Error('Unable to load the MSONJO business for user administration.');
  }

  const { data: memberships, error: membershipError } = await admin
    .from('business_members')
    .select('user_id, role')
    .eq('business_id', business.id);

  if (membershipError) {
    throw new Error('Unable to load MSONJO user memberships.');
  }

  const authUsers = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      throw new Error('Unable to load MSONJO Auth users.');
    }
    authUsers.push(...data.users);
    if (data.users.length < 1000) break;
  }

  const rolesByUserId = new Map(
    memberships.map((membership) => [membership.user_id, membership.role]),
  );
  const users = authUsers.flatMap((user) => {
    const role = rolesByUserId.get(user.id);
    if (!role) {
      return [];
    }
    const metadataUsername = user.app_metadata.username;
    const username = typeof metadataUsername === 'string'
      ? metadataUsername
      : user.email?.split('@')[0] ?? user.id;
    const metadataName = user.user_metadata.name;
    return [{
      id: user.id,
      username,
      name: typeof metadataName === 'string' ? metadataName : username,
      contactEmail: typeof user.user_metadata.contact_email === 'string'
        ? user.user_metadata.contact_email
        : '',
      authEmail: user.email ?? '',
      role,
    }];
  }).sort((left, right) => left.username.localeCompare(right.username));

  return (
    <>
      <InventoryPageHeader
        title="User administration"
        description="Create MSONJO sign-in accounts and assign inventory roles. Only Supabase Auth admins can manage users here."
      />
      <AdminUserPanel users={users} />
    </>
  );
}
