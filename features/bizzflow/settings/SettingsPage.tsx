import InventoryPageHeader from '../shared/InventoryPageHeader';
import AccountSettingsForm from './AccountSettingsForm';
import { getActiveBusinessContext } from '@/lib/bizzflow/context';

const roleLabels = {
  owner: 'Owner',
  manager: 'Manager',
  attendant: 'Attendant',
} as const;

export default async function SettingsPage() {
  const { business, user } = await getActiveBusinessContext();
  const username = typeof user.app_metadata.username === 'string'
    ? user.app_metadata.username
    : '';
  const name = typeof user.user_metadata.name === 'string'
    ? user.user_metadata.name
    : '';

  return (
    <>
      <InventoryPageHeader
        title="Settings"
        description="Manage your account details and review your MSONJO workspace access."
        action={user.app_metadata.role === 'admin' || business.role === 'owner'
          ? { label: 'Staff & users', href: '/staff' }
          : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="account-settings-heading" className="rounded border border-neutral-200 bg-white p-4 sm:p-5">
          <h2 id="account-settings-heading" className="text-base font-semibold text-[#252525]">
            Account details
          </h2>
          <p className="mt-1 text-sm leading-6 text-neutral-600">
            Update your display name or change your password.
          </p>
          <AccountSettingsForm initialName={name} />
        </section>

        <section aria-labelledby="workspace-settings-heading" className="rounded border border-neutral-200 bg-white p-4 sm:p-5">
          <h2 id="workspace-settings-heading" className="text-base font-semibold text-[#252525]">
            MSONJO workspace
          </h2>
          <dl className="mt-4 divide-y divide-neutral-200 text-sm">
            <div className="flex flex-wrap justify-between gap-2 py-3">
              <dt className="text-neutral-600">Business</dt>
              <dd className="font-medium text-[#252525]">{business.name}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2 py-3">
              <dt className="text-neutral-600">Your username</dt>
              <dd className="font-medium text-[#252525]">{username ? `@${username}` : 'Not set'}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2 py-3">
              <dt className="text-neutral-600">Inventory access</dt>
              <dd className="font-medium text-[#252525]">{roleLabels[business.role]}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2 py-3">
              <dt className="text-neutral-600">User administration</dt>
              <dd className="font-medium text-[#252525]">
                {user.app_metadata.role === 'admin'
                  ? 'Administrator'
                  : business.role === 'owner' ? 'Owner access' : 'Not enabled'}
              </dd>
            </div>
          </dl>
          <p className="mt-3 border-t border-neutral-200 pt-3 text-xs leading-5 text-neutral-600">
            The MSONJO owner manages staff access and workspace roles.
          </p>
        </section>
      </div>
    </>
  );
}
