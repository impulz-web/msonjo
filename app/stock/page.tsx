import StockPage from '@/features/bizzflow/stock/StockPage';

export default async function InventoryStockRoute({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; product?: string; from?: string; to?: string; page?: string }>;
}) {
  return <StockPage searchParams={await searchParams} />;
}
