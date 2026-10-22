import ProductsPage from '@/features/bizzflow/products/ProductsPage';

export default async function InventoryProductsRoute({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; stock?: string; sort?: string; page?: string; notice?: string }>;
}) {
  return <ProductsPage searchParams={await searchParams} />;
}
