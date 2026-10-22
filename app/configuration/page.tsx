import Link from 'next/link';
import { getSupabaseConfig } from '@/lib/supabase/config';

export default async function ConfigurationPage({
  searchParams,
}: {
  searchParams: Promise<{ issue?: string }>;
}) {
  const { issue } = await searchParams;
  const config = getSupabaseConfig();

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-12 sm:py-20">
      <p className="text-sm font-semibold text-[#E31E24]">MSONJO setup</p>
      <h1 className="mt-2 text-2xl font-semibold text-[#252525]">Connect the MSONJO Supabase project</h1>
      <p className="mt-3 text-sm leading-6 text-neutral-700">
        Authentication and inventory data require the MSONJO Supabase project and an authorized
        account.
      </p>

      {issue === 'access' ? (
        <section role="alert" className="mt-5 rounded border border-[#FFD600] bg-[#FFD600] p-4">
          <h2 className="text-sm font-semibold text-[#252525]">Access not set up yet</h2>
          <p className="mt-1 text-sm leading-6 text-[#252525]">
            Ask your MSONJO administrator to grant your account access, then sign in again.
          </p>
        </section>
      ) : null}
      {issue === 'database' ? (
        <section role="alert" className="mt-5 rounded border border-neutral-300 bg-[#F5F5F5] p-4">
          <h2 className="text-sm font-semibold text-[#252525]">We couldn’t load your account</h2>
          <p className="mt-1 text-sm leading-6 text-neutral-800">
            Please try again later or contact your MSONJO administrator.
          </p>
        </section>
      ) : null}
      {issue === 'auth' ? (
        <section role="alert" className="mt-5 rounded border border-neutral-300 bg-[#F5F5F5] p-4">
          <h2 className="text-sm font-semibold text-[#252525]">We couldn’t verify your sign-in</h2>
          <p className="mt-1 text-sm leading-6 text-neutral-800">
            Please sign in again. If the problem continues, contact your MSONJO administrator.
          </p>
        </section>
      ) : null}

      {!issue ? (
        <section className="mt-6 rounded border border-neutral-200 p-5">
          <h2 className="text-sm font-semibold text-[#252525]">Required environment variables</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-neutral-700">
            <li><code>MSONJO_SUPABASE_URL</code> — dedicated project URL</li>
            <li><code>MSONJO_SUPABASE_PUBLISHABLE_KEY</code> — project publishable key</li>
            <li><code>MSONJO_SUPABASE_SERVICE_ROLE_KEY</code> — server-only key for admin user creation and password resets</li>
            <li><code>MSONJO_SITE_URL</code> — trusted MSONJO origin for auth email links</li>
          </ul>
          <p className="mt-3 text-sm text-neutral-700">
            Never expose the service-role key in browser code or a NEXT_PUBLIC_ variable.
          </p>
          <p className="mt-4 text-sm text-neutral-700">
            MSONJO origin: {process.env.MSONJO_SITE_URL ? 'configured' : 'missing'}.
          </p>
          <p className="mt-4 text-sm text-neutral-700">
            Configuration status: {config ? 'Supabase URL and publishable key are present.' : 'Supabase URL or publishable key is missing.'}
          </p>
          <p className="mt-2 text-sm text-neutral-700">
            Apply the reviewed MSONJO migrations to the dedicated project before authorizing accounts.
          </p>
        </section>
      ) : null}

      <Link
        href="/login"
        className="mt-5 inline-flex min-h-10 items-center text-sm font-medium text-[#E31E24] underline underline-offset-4"
      >
        Return to sign in
      </Link>
    </main>
  );
}
