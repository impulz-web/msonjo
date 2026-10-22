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
  const [membershipResult, businessResult] = await Promise.all([
    supabase
      .from('business_members')
      .select('business_id, role')
      .eq('user_id', userId),
    supabase
      .from('businesses')
      .select('id, name, slug')
      .eq('slug', 'msonjo-gas-house-hold')
      .maybeSingle(),
  ]);
  const { data: memberships, error: membershipError } = membershipResult;
  const { data: business, error: businessesError } = businessResult;

  if (membershipError) {
    throw new BusinessAccessError(
      'Unable to load MSONJO memberships. Verify the MSONJO database migrations are applied.',
    );
  }

  if (!memberships.length) {
    return [];
  }

  if (businessesError) {
    throw new BusinessAccessError('Unable to load authorized businesses.');
  }

  if (!business) return [];

  const membership = memberships.find(({ business_id }) => business_id === business.id);
  return membership ? [{ ...business, role: membership.role }] : [];
}
