import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

export type AuthorizedBusiness = {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'manager' | 'attendant';
};

export class BusinessAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessAccessError';
  }
}

export async function getAuthorizedBusinesses(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<AuthorizedBusiness[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from('business_members')
    .select('business_id, role')
    .eq('user_id', userId);

  if (membershipError) {
    throw new BusinessAccessError(
      'Unable to load MSONJO memberships. Verify the MSONJO database migrations are applied.',
    );
  }

  if (!memberships.length) {
    return [];
  }

  const { data: businesses, error: businessesError } = await supabase
    .from('businesses')
    .select('id, name, slug')
    .in('id', memberships.map(({ business_id }) => business_id))
    .eq('slug', 'msonjo-gas-house-hold');

  if (businessesError) {
    throw new BusinessAccessError('Unable to load authorized businesses.');
  }

  const rolesByBusiness = new Map(
    memberships.map(({ business_id, role }) => [business_id, role]),
  );

  return businesses.flatMap((business) => {
    const role = rolesByBusiness.get(business.id);
    if (!role) {
      return [];
    }

    return [{ ...business, role }];
  });
}
