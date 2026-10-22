import InventoryPageHeader from '../shared/InventoryPageHeader';
import NotConnectedNotice from '../shared/NotConnectedNotice';

export default function SettingsPage() {
  return (
    <>
      <InventoryPageHeader
        title="Settings"
        description="Business profile, access, and subscription settings will be available here."
      />
      <NotConnectedNotice>
        Business settings are not available until authentication and a securely scoped business
        workspace are configured.
      </NotConnectedNotice>
    </>
  );
}
