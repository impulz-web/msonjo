import ReportsPage from '@/features/bizzflow/reports/ReportsPage';

export default async function InventoryReportsRoute({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  return <ReportsPage searchParams={await searchParams} />;
}
