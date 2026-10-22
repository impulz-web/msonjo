import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import InventoryShell from '@/features/bizzflow/shared/InventoryShell';
import {
  BusinessAccessError,
  getAuthorizedBusinesses,
  type AuthorizedBusiness,
} from '@/lib/bizzflow/businesses';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import './globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: '--font-plus-jakarta-sans',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'MSONJO GAS & HOUSE HOLD',
    template: '%s | MSONJO GAS & HOUSE HOLD',
  },
  description:
    'MSONJO GAS & HOUSE HOLD inventory, sales, stock management, and reporting.',
};

const publicPaths = new Set([
  '/',
  '/login',
  '/configuration',
]);

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get('x-msonjo-pathname') ?? '/';

  if (publicPaths.has(pathname)) {
    return (
      <html lang="en">
        <body className={`${plusJakartaSans.variable} min-h-screen bg-white text-[#252525] antialiased`}>
          {children}
        </body>
      </html>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  let businesses: AuthorizedBusiness[];
  try {
    businesses = await getAuthorizedBusinesses(supabase, user.id);
  } catch (loadError) {
    if (loadError instanceof BusinessAccessError) {
      redirect('/configuration?issue=database');
    }
    throw loadError;
  }

  if (!businesses.length) {
    redirect('/configuration?issue=access');
  }

  const business = businesses[0];

  return (
    <html lang="en">
      <body className={`${plusJakartaSans.variable} min-h-screen bg-white text-[#252525] antialiased`}>
        <InventoryShell
          activeBusinessName={business.name}
          userEmail={typeof user.user_metadata.name === 'string'
            ? user.user_metadata.name
            : typeof user.app_metadata.username === 'string'
              ? `@${user.app_metadata.username}`
              : 'Signed-in account'}
          canManageUsers={user.app_metadata.role === 'admin' || business.role === 'owner'}
        >
          {children}
        </InventoryShell>
      </body>
    </html>
  );
}
