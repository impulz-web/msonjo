import { redirect } from 'next/navigation';
import { getAuthorizedBusinesses, type AuthorizedBusiness } from './businesses';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type BusinessRole = AuthorizedBusiness['role'];

export async function getActiveBusinessContext(allowedRoles?: BusinessRole[]) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    redirect('/login');
  }

  const businesses = await getAuthorizedBusinesses(supabase, user.id);
  if (!businesses.length) {
    redirect('/configuration?issue=access');
  }

  const business = businesses[0];

  if (allowedRoles && !allowedRoles.includes(business.role)) {
    redirect('/?error=permission');
  }

  return { supabase, user, business };
}
