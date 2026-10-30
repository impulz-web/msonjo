import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import InventoryPageHeader from '@/features/bizzflow/shared/InventoryPageHeader';
import ProductForm from '@/features/bizzflow/operations/ProductForm';
import { getActiveBusinessContext } from '@/lib/bizzflow/context';

export default async function NewProductPage() {
  await getActiveBusinessContext();
  return (
    <>
      <InventoryPageHeader title="Add product" description="Create a product and optionally record its initial stock." />
      <ProductForm initialOperationKey={randomUUID()} />
      <Link href="/products" className="mt-5 inline-flex text-sm text-[#E31E24] underline">Cancel</Link>
    </>
  );
}
