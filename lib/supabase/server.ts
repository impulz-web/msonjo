import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/database.types';
import { getSupabaseConfig } from './config';

export async function createSupabaseServerClient() {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error(
      'MSONJO Supabase is not configured. Set MSONJO_SUPABASE_URL and MSONJO_SUPABASE_PUBLISHABLE_KEY.',
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(config.url, config.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies; middleware refreshes their sessions.
        }
      },
    },
  });
}
