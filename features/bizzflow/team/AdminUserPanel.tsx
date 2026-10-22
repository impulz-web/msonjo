'use client';

import { Eye, EyeOff, KeyRound, UserPlus } from 'lucide-react';
import { useActionState, useState } from 'react';
import {
  createManagedUserAction,
  resetManagedUserPasswordAction,
} from '@/app/admin-actions';

type FormState = {
  error?: string;
  success?: string;
};

type ManagedUser = {
  id: string;
  name: string;
  username: string;
  role: string;
};

function PasswordInput({
  id,
  name,
  value,
  onChange,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="new-password"
        minLength={12}
        maxLength={72}
        required
        className="min-h-11 w-full rounded border border-neutral-300 bg-white px-3 pr-12 text-sm text-[#252525] focus:border-[#E31E24] focus:outline-none focus:ring-1 focus:ring-[#E31E24]"
      />
      <button
        type="button"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-neutral-600 hover:text-[#252525]"
      >
        {visible
          ? <EyeOff aria-hidden="true" className="size-4" />
          : <Eye aria-hidden="true" className="size-4" />}
      </button>
    </div>
  );
}

function CreateUserForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createManagedUserAction,
    {},
  );
  const [password, setPassword] = useState('');

  return (
    <form action={formAction} className="grid gap-4 rounded border border-neutral-200 bg-white p-4 sm:grid-cols-2 sm:p-5">
      <label className="block text-sm font-medium text-[#252525]">
        Full name
        <input
          name="name"
          autoComplete="name"
          required
          minLength={2}
          maxLength={80}
          className="mt-1 min-h-11 w-full rounded border border-neutral-300 bg-white px-3 text-sm text-[#252525] focus:border-[#E31E24] focus:outline-none focus:ring-1 focus:ring-[#E31E24]"
        />
      </label>
      <label className="block text-sm font-medium text-[#252525]">
        Username
        <input
          name="username"
          autoCapitalize="none"
          autoComplete="off"
          required
          minLength={3}
          maxLength={32}
          pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}"
          aria-describedby="username-help"
          className="mt-1 min-h-11 w-full rounded border border-neutral-300 bg-white px-3 text-sm text-[#252525] focus:border-[#E31E24] focus:outline-none focus:ring-1 focus:ring-[#E31E24]"
        />
        <span id="username-help" className="mt-1 block text-xs font-normal text-neutral-600">
          Lowercase letters, numbers, dots, underscores, or hyphens.
        </span>
      </label>
      <label className="block text-sm font-medium text-[#252525]">
        Initial password
        <div className="mt-1">
          <PasswordInput
            id="create-user-password"
            name="password"
            value={password}
            onChange={setPassword}
          />
        </div>
        <span className="mt-1 block text-xs font-normal text-neutral-600">
          12–72 characters. You can view it here while this form is open.
        </span>
      </label>
      <label className="block text-sm font-medium text-[#252525]">
        Inventory role
        <select
          name="role"
          defaultValue="attendant"
          className="mt-1 min-h-11 w-full rounded border border-neutral-300 bg-white px-3 text-sm text-[#252525] focus:border-[#E31E24] focus:outline-none focus:ring-1 focus:ring-[#E31E24]"
        >
          <option value="attendant">Attendant</option>
          <option value="manager">Manager</option>
          <option value="owner">Owner</option>
        </select>
      </label>
      {state.error ? <p role="alert" className="text-sm text-red-700 sm:col-span-2">{state.error}</p> : null}
      {state.success ? <p role="status" className="rounded bg-[#FFD600] p-3 text-sm text-[#252525] sm:col-span-2">{state.success}</p> : null}
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center gap-2 rounded bg-[#E31E24] px-4 text-sm font-semibold !text-white hover:!text-white disabled:!text-white disabled:opacity-60"
        >
          <UserPlus aria-hidden="true" className="size-4" />
          {pending ? 'Creating account…' : 'Create user'}
        </button>
      </div>
    </form>
  );
}

function ResetPasswordForm({ userId }: { userId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    resetManagedUserPasswordAction,
    {},
  );
  const [password, setPassword] = useState('');

  return (
    <form action={formAction} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
      <input type="hidden" name="user_id" value={userId} />
      <label className="block text-xs font-medium text-[#252525]">
        New password
        <span className="mt-1 block">
          <PasswordInput
            id={`reset-password-${userId}`}
            name="password"
            value={password}
            onChange={setPassword}
          />
        </span>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded bg-[#E31E24] px-4 text-sm font-medium !text-white hover:!text-white disabled:!text-white disabled:opacity-60"
      >
        <KeyRound aria-hidden="true" className="size-4" />
        {pending ? 'Saving…' : 'Set password'}
      </button>
      {state.error ? <p role="alert" className="text-sm text-red-700 sm:col-span-2">{state.error}</p> : null}
      {state.success ? <p role="status" className="rounded bg-[#FFD600] p-3 text-sm text-[#252525] sm:col-span-2">{state.success}</p> : null}
    </form>
  );
}

export default function AdminUserPanel({ users }: { users: ManagedUser[] }) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="create-user-heading" className="space-y-4">
        <div>
          <h2 id="create-user-heading" className="text-base font-semibold text-[#252525]">Create a user</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Set the user’s name, username, password, and inventory permissions.
          </p>
        </div>
        <CreateUserForm />
      </section>

      <section aria-labelledby="users-heading" className="space-y-3">
        <div>
          <h2 id="users-heading" className="text-base font-semibold text-[#252525]">MSONJO users</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Reset a password if a user forgets it. Existing passwords cannot be viewed.
          </p>
        </div>
        {users.length ? (
          <ul className="divide-y divide-neutral-200 rounded border border-neutral-200">
            {users.map((user) => (
              <li key={user.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[#252525]">{user.name}</h3>
                    <p className="mt-1 text-sm text-neutral-600">
                      @{user.username} · {user.role}
                    </p>
                  </div>
                </div>
                <ResetPasswordForm userId={user.id} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded border border-neutral-200 bg-[#F5F5F5] p-4 text-sm text-neutral-600">
            No managed users have been created yet.
          </p>
        )}
      </section>
    </div>
  );
}
