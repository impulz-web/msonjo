import StockPage from '@/features/bizzflow/stock/StockPage';

export default async function StockRoute({
  searchParams,
}: {
  searchParams: Promise<{ movement_type?: string; page?: string }>;
}) {
  return <StockPage searchParams={await searchParams} />;
}
