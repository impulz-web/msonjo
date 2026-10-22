import Link from 'next/link';
import AuthForm from './AuthForm';
import { getSupabaseConfig } from '@/lib/supabase/config';

export default function AuthPage() {
  const configured = Boolean(getSupabaseConfig());

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10">
      <section className="w-full max-w-md">
        <Link href="/" className="mb-8 inline-flex items-center gap-3 text-[#252525] no-underline">
          <span className="flex size-10 items-center justify-center rounded bg-[#E31E24] text-sm font-bold text-white">
            M
          </span>
          <span>
            <span className="block text-base font-semibold">MSONJO GAS &amp; HOUSE HOLD</span>
            <span className="block text-xs text-neutral-600">Your stock, wherever you are.</span>
          </span>
        </Link>
        <div className="rounded border border-neutral-200 bg-white p-5 sm:p-7">
          <h1 className="text-xl font-semibold tracking-tight text-[#252525]">Sign in to MSONJO</h1>
          <p className="mt-1 mb-6 text-sm leading-6 text-neutral-600">
            Access MSONJO GAS &amp; HOUSE HOLD inventory.
          </p>
          <AuthForm enabled={configured} />
        </div>
        <p className="mt-5 text-center text-xs text-neutral-600">
          MSONJO inventory management
        </p>
      </section>
    </main>
  );
}
