'use client';

import { Eye, EyeOff, KeyRound, Save, Trash2, UserPlus, Users } from 'lucide-react';
import { useActionState, useState } from 'react';
import {
  createManagedUserAction,
  deleteManagedUserAction,
  resetManagedUserPasswordAction,
  updateManagedUserContactEmailAction,
  updateManagedUserRoleAction,
} from '@/app/admin-actions';

type FormState = {
  error?: string;
  success?: string;
};

type ManagedUser = {
  id: string;
  name: string;
  username: string;
  contactEmail: string;
  authEmail: string;
  role: 'owner' | 'manager' | 'attendant';
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
        Contact email (optional)
        <input
          name="contact_email"
          type="email"
          autoComplete="email"
          maxLength={254}
          className="mt-1 min-h-11 w-full rounded border border-neutral-300 bg-white px-3 text-sm text-[#252525] focus:border-[#E31E24] focus:outline-none focus:ring-1 focus:ring-[#E31E24]"
        />
        <span className="mt-1 block text-xs font-normal text-neutral-600">
          Stored on the Supabase Auth profile; username sign-in does not change.
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
          <option value="owner">Owner — full access</option>
        </select>
        <span className="mt-1 block text-xs font-normal text-neutral-600">
          All users can manage inventory and reports. Only owners can add users and manage user roles.
        </span>
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

function ContactEmailForm({
  userId,
  contactEmail,
}: {
  userId: string;
  contactEmail: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateManagedUserContactEmailAction,
    {},
  );

  return (
    <form action={formAction} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
      <input type="hidden" name="user_id" value={userId} />
      <label className="block text-xs font-medium text-[#252525]">
        Contact email
        <input
          name="contact_email"
          type="email"
          autoComplete="email"
          maxLength={254}
          defaultValue={contactEmail}
          aria-describedby={`contact-email-help-${userId}`}
          className="mt-1 min-h-11 w-full rounded border border-neutral-300 bg-white px-3 text-sm text-[#252525] focus:border-[#E31E24] focus:outline-none focus:ring-1 focus:ring-[#E31E24]"
        />
        <span id={`contact-email-help-${userId}`} className="mt-1 block font-normal text-neutral-600">
          Leave blank to remove. This does not change username sign-in.
        </span>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="mt-auto inline-flex min-h-11 items-center justify-center rounded bg-[#E31E24] px-4 text-sm font-medium !text-white hover:!text-white disabled:!text-white disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Save contact email'}
      </button>
      {state.error ? <p role="alert" className="text-sm text-red-700 sm:col-span-2">{state.error}</p> : null}
      {state.success ? <p role="status" className="rounded bg-[#FFD600] p-3 text-sm text-[#252525] sm:col-span-2">{state.success}</p> : null}
    </form>
  );
}

function InventoryRoleForm({
  userId,
  role,
}: {
  userId: string;
  role: ManagedUser['role'];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateManagedUserRoleAction,
    {},
  );

  return (
    <form action={formAction} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
      <input type="hidden" name="user_id" value={userId} />
      <label className="block text-xs font-medium text-[#252525]">
        Inventory role
        <select
          name="role"
          defaultValue={role}
          className="mt-1 min-h-11 w-full rounded border border-neutral-300 bg-white px-3 text-sm text-[#252525] focus:border-[#E31E24] focus:outline-none focus:ring-1 focus:ring-[#E31E24]"
        >
          <option value="attendant">Attendant</option>
          <option value="manager">Manager</option>
          <option value="owner">Owner</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded bg-[#E31E24] px-4 text-sm font-medium !text-white hover:!text-white disabled:!text-white disabled:opacity-60"
      >
        <Save aria-hidden="true" className="size-4" />
        {pending ? 'Saving…' : 'Save role'}
      </button>
      {state.error ? <p role="alert" className="text-sm text-red-700 sm:col-span-2">{state.error}</p> : null}
      {state.success ? <p role="status" className="rounded bg-[#FFD600] p-3 text-sm text-[#252525] sm:col-span-2">{state.success}</p> : null}
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

function DeleteUserForm({ userId, username }: { userId: string; username: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    deleteManagedUserAction,
    {},
  );

  return (
    <form
      action={formAction}
      className="mt-4 border-t border-neutral-200 pt-4"
      onSubmit={(event) => {
        if (!window.confirm(
          `Delete @${username}? Their sign-in access will be removed. Historical sales and stock records stay, but their creator attribution will be cleared.`,
        )) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="user_id" value={userId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-10 items-center gap-2 rounded border border-red-300 px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
      >
        <Trash2 aria-hidden="true" className="size-4" />
        {pending ? 'Deleting…' : 'Delete user'}
      </button>
      {state.error ? <p role="alert" className="mt-2 text-sm text-red-700">{state.error}</p> : null}
    </form>
  );
}

export default function AdminUserPanel({
  users,
  currentUserId,
}: {
  users: ManagedUser[];
  currentUserId: string;
}) {
  return (
    <div className="space-y-3">
      <details className="group rounded border border-neutral-200 bg-white">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
          <UserPlus aria-hidden="true" className="size-4 shrink-0 text-[#E31E24]" />
          <span className="flex-1">
            <span className="block text-sm font-semibold text-[#252525]">Add user</span>
            <span className="mt-0.5 block text-xs text-neutral-600">Create an owner, manager, or attendant account</span>
          </span>
          <span aria-hidden="true" className="text-xl leading-none text-neutral-500 group-open:rotate-45">+</span>
        </summary>
        <div className="border-t border-neutral-200 p-4 sm:p-5">
          <CreateUserForm />
        </div>
      </details>

      <details className="group rounded border border-neutral-200 bg-white">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
          <Users aria-hidden="true" className="size-4 shrink-0 text-[#E31E24]" />
          <span className="flex-1">
            <span className="block text-sm font-semibold text-[#252525]">Users</span>
            <span className="mt-0.5 block text-xs text-neutral-600">
              {users.length} {users.length === 1 ? 'account' : 'accounts'} · Select a user to manage access
            </span>
          </span>
          <span aria-hidden="true" className="text-xl leading-none text-neutral-500 group-open:rotate-45">+</span>
        </summary>
        <div className="border-t border-neutral-200 p-3 sm:p-4">
          {users.length ? (
            <ul className="space-y-2">
              {users.map((user) => (
                <li key={user.id}>
                  <details className="group/user rounded border border-neutral-200 bg-white">
                    <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3 py-3 marker:hidden [&::-webkit-details-marker]:hidden sm:px-4">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[#252525]">{user.name}</span>
                        <span className="mt-0.5 block text-xs text-neutral-600">@{user.username}</span>
                      </span>
                      <span className="rounded bg-[#F5F5F5] px-2 py-1 text-xs font-medium capitalize text-[#252525]">
                        {user.role}
                      </span>
                      <span aria-hidden="true" className="text-xl leading-none text-neutral-500 group-open/user:rotate-45">+</span>
                    </summary>
                    <div className="border-t border-neutral-200 bg-[#F5F5F5] p-3 sm:p-4">
                      <div className="mb-4 space-y-1 text-sm">
                        <p className="font-semibold text-[#252525]">{user.name}</p>
                        <p className="text-neutral-600">Contact email: {user.contactEmail || 'Not set'}</p>
                        {user.authEmail ? (
                          <p className="break-all text-neutral-600">Supabase Auth: {user.authEmail}</p>
                        ) : null}
                      </div>
                      <InventoryRoleForm userId={user.id} role={user.role} />
                      <ContactEmailForm userId={user.id} contactEmail={user.contactEmail} />
                      <ResetPasswordForm userId={user.id} />
                      {user.id !== currentUserId ? (
                        <DeleteUserForm userId={user.id} username={user.username} />
                      ) : (
                        <p className="mt-4 border-t border-neutral-200 pt-4 text-xs text-neutral-600">
                          You cannot delete the account you are currently using.
                        </p>
                      )}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded border border-neutral-200 bg-[#F5F5F5] p-4 text-sm text-neutral-600">
              No users have been added yet.
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
