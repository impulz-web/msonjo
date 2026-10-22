import SalesPage from '@/features/bizzflow/sales/SalesPage';

export default async function InventorySalesRoute({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  return <SalesPage searchParams={await searchParams} />;
}
