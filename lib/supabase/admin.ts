import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import type { Database } from '@/lib/database.types';
import { createSupabaseServerClient } from './server';
import { getSupabaseConfig } from './config';

function isServiceRoleKey(key: string) {
  if (key.startsWith('sb_secret_')) {
    return key.length > 'sb_secret_'.length;
  }

  const parts = key.split('.');
  if (parts.length !== 3) {
    return false;
  }

  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const normalizedPayload = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const claims = JSON.parse(atob(normalizedPayload)) as { role?: unknown };
    return claims.role === 'service_role';
  } catch {
    return false;
  }
}

export function createSupabaseAdminClient() {
  const config = getSupabaseConfig();
  const serviceRoleKey = process.env.MSONJO_SUPABASE_SERVICE_ROLE_KEY;

  if (!config || !serviceRoleKey || !isServiceRoleKey(serviceRoleKey)) {
    throw new Error(
      'MSONJO admin operations require a valid service-role key in MSONJO_SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  return createClient<Database>(config.url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export async function requireMsonjoAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }
  if (user.app_metadata.role !== 'admin') {
    redirect('/dashboard');
  }

  return user;
}
