import { randomUUID } from 'node:crypto';
import InventoryPageHeader from '@/features/bizzflow/shared/InventoryPageHeader';
import SaleForm from '@/features/bizzflow/operations/SaleForm';
import { getActiveBusinessContext } from '@/lib/bizzflow/context';

export default async function NewSalePage() {
  await getActiveBusinessContext();
  return (
    <>
      <InventoryPageHeader title="Add sale" description="Choose products, enter payment details, and save the sale." />
      <SaleForm
        initialIdempotencyKey={randomUUID()}
        canViewCosts
      />
    </>
  );
}
