'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useActionState, useState } from 'react';
import { loginAction, type FormState } from '@/app/actions';

export default function AuthForm({ enabled }: { enabled: boolean }) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    loginAction,
    {},
  );
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <form action={formAction} className="space-y-4">
      {!enabled ? (
        <p role="status" className="rounded border border-neutral-300 bg-[#F5F5F5] p-3 text-sm leading-6 text-neutral-800">
          MSONJO authentication is not configured. Check the required Supabase settings.
        </p>
      ) : null}
      <label className="block text-sm font-medium text-[#252525]">
        Email or username
        <input
          autoCapitalize="none"
          autoComplete="username"
          className="mt-1 min-h-11 w-full rounded border border-neutral-300 bg-white px-3 text-sm text-[#252525] outline-none focus:border-[#E31E24] focus:ring-1 focus:ring-[#E31E24]"
          name="identifier"
          required
          minLength={3}
          maxLength={254}
        />
        <span className="mt-1 block text-xs font-normal text-neutral-600">
          Use your Supabase Auth email or your MSONJO username.
        </span>
      </label>

      <label className="block text-sm font-medium text-[#252525]">
        Password
        <span className="relative mt-1 block">
          <input
            autoComplete="current-password"
            className="min-h-11 w-full rounded border border-neutral-300 bg-white px-3 pr-12 text-sm text-[#252525] outline-none focus:border-[#E31E24] focus:ring-1 focus:ring-[#E31E24]"
            name="password"
            required
            type={passwordVisible ? 'text' : 'password'}
            maxLength={72}
          />
          <button
            type="button"
            aria-label={passwordVisible ? 'Hide password' : 'Show password'}
            aria-pressed={passwordVisible}
            onClick={() => setPasswordVisible((visible) => !visible)}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-neutral-600 hover:text-[#252525]"
          >
            {passwordVisible
              ? <EyeOff aria-hidden="true" className="size-4" />
              : <Eye aria-hidden="true" className="size-4" />}
          </button>
        </span>
      </label>

      {state.error ? <p role="alert" className="text-sm text-[#252525]">{state.error}</p> : null}
      {state.success ? (
        <p role="status" className="rounded border border-neutral-300 bg-[#F5F5F5] p-3 text-sm text-neutral-800">
          {state.success}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending || !enabled}
        className="inline-flex min-h-11 w-full items-center justify-center rounded bg-[#E31E24] px-4 text-sm font-semibold !text-white hover:bg-[#E31E24] hover:!text-white focus-visible:!text-white disabled:!text-white disabled:cursor-wait disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E31E24]"
      >
        {isPending ? 'Signing in…' : 'Sign in'}
      </button>
   
    </form>
  );
}
