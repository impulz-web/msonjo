import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAuthSessionMissingError } from '@supabase/supabase-js';
import { BusinessAccessError, getAuthorizedBusinesses } from '@/lib/bizzflow/businesses';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function HomePage() {
  if (getSupabaseConfig()) {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error && !isAuthSessionMissingError(error)) {
      redirect('/configuration?issue=auth');
    }

    if (user) {
      try {
        const businesses = await getAuthorizedBusinesses(supabase, user.id);
        redirect(businesses.length ? '/dashboard' : '/configuration?issue=access');
      } catch (loadError) {
        if (loadError instanceof BusinessAccessError) {
          redirect('/configuration?issue=database');
        }
        throw loadError;
      }
    }
  }

  return (
    <main className="min-h-screen bg-white text-[#252525]">
      <header className="bg-[#E31E24] text-white">
        <div className="mx-auto flex min-h-[76px] w-full max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link
            href="/"
            aria-label="MSONJO home"
            className="text-xl font-bold tracking-tight text-white no-underline sm:text-2xl"
          >
            MSONJO
          </Link>
          <nav aria-label="Account" className="flex items-center">
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center justify-center rounded border border-white px-4 text-sm font-semibold text-white no-underline hover:bg-white hover:text-[#E31E24] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:px-5"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-7xl flex-col items-center px-5 pb-12 pt-12 text-center sm:px-8 sm:pt-16 lg:pt-20">
        <h1 className="text-5xl font-bold tracking-tight text-[#252525] sm:text-6xl lg:text-7xl">
          MSONJO GAS &amp; HOUSE HOLD
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-700 sm:mt-6 sm:text-lg sm:leading-8">
          Manage MSONJO inventory, track sales, and monitor stock levels from anywhere.
        </p>
        <div className="mt-12 w-full max-w-5xl overflow-hidden rounded-lg border border-neutral-200 bg-white sm:mt-16">
          <Image
            src="/msonjo%20homepage.png"
            alt="MSONJO shop owner managing gas and household inventory"
            width={1672}
            height={941}
            priority
            className="h-auto w-full"
            sizes="(max-width: 768px) 100vw, 1024px"
          />
        </div>
      </section>
      <footer className="bg-[#E31E24] text-white">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-center px-5 text-center text-sm font-medium sm:px-8">
          MSONJO GAS &amp; HOUSE HOLD
        </div>
      </footer>
    </main>
  );
}
