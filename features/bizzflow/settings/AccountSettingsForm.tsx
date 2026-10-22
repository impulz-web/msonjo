'use client';

import { useActionState } from 'react';
import {
  updateAccountNameAction,
  updateAccountPasswordAction,
  type SettingsFormState,
} from '@/app/settings-actions';

function ActionMessage({ state }: { state: SettingsFormState }) {
  return (
    <>
      {state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}
      {state.success ? (
        <p role="status" className="rounded bg-[#FFD600] p-3 text-sm text-[#252525]">
          {state.success}
        </p>
      ) : null}
    </>
  );
}

export default function AccountSettingsForm({ initialName }: { initialName: string }) {
  const [nameState, nameAction, namePending] = useActionState<SettingsFormState, FormData>(
    updateAccountNameAction,
    {},
  );
  const [passwordState, passwordAction, passwordPending] = useActionState<SettingsFormState, FormData>(
    updateAccountPasswordAction,
    {},
  );

  return (
    <div className="mt-5 space-y-6">
      <form action={nameAction} className="space-y-3">
        <label className="block text-sm font-medium text-[#252525]">
          Display name
          <input
            name="name"
            autoComplete="name"
            defaultValue={initialName}
            required
            minLength={2}
            maxLength={80}
            className="mt-1 min-h-11 w-full rounded border border-neutral-300 bg-white px-3 text-sm text-[#252525] focus:border-[#E31E24] focus:outline-none focus:ring-1 focus:ring-[#E31E24]"
          />
        </label>
        <ActionMessage state={nameState} />
        <button
          type="submit"
          disabled={namePending}
          className="inline-flex min-h-10 items-center justify-center rounded bg-[#E31E24] px-4 text-sm font-medium !text-white hover:!text-white disabled:!text-white disabled:opacity-60"
        >
          {namePending ? 'Saving…' : 'Save name'}
        </button>
      </form>

      <form action={passwordAction} className="space-y-3 border-t border-neutral-200 pt-5">
        <h3 className="text-sm font-semibold text-[#252525]">Change password</h3>
        <label className="block text-sm font-medium text-[#252525]">
          New password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={72}
            className="mt-1 min-h-11 w-full rounded border border-neutral-300 bg-white px-3 text-sm text-[#252525] focus:border-[#E31E24] focus:outline-none focus:ring-1 focus:ring-[#E31E24]"
          />
        </label>
        <label className="block text-sm font-medium text-[#252525]">
          Confirm new password
          <input
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={72}
            className="mt-1 min-h-11 w-full rounded border border-neutral-300 bg-white px-3 text-sm text-[#252525] focus:border-[#E31E24] focus:outline-none focus:ring-1 focus:ring-[#E31E24]"
          />
        </label>
        <p className="text-xs leading-5 text-neutral-600">Use 12–72 characters.</p>
        <ActionMessage state={passwordState} />
        <button
          type="submit"
          disabled={passwordPending}
          className="inline-flex min-h-10 items-center justify-center rounded bg-[#E31E24] px-4 text-sm font-medium !text-white hover:!text-white disabled:!text-white disabled:opacity-60"
        >
          {passwordPending ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </div>
  );
}
