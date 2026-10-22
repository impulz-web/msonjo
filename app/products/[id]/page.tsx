import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import InventoryPageHeader from '@/features/bizzflow/shared/InventoryPageHeader';
import StockAdjustmentForm from '@/features/bizzflow/operations/StockAdjustmentForm';
import { archiveProductAction } from '@/features/bizzflow/operations/actions';
import { getActiveBusinessContext } from '@/lib/bizzflow/context';
import { formatKes, parseProduct } from '@/lib/bizzflow/operations-data';

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, business } = await getActiveBusinessContext();
  const { data, error } = await supabase.rpc('get_product_detail', {
    p_business_id: business.id,
    p_product_id: id,
  });
  if (error) {
    return <p role="alert" className="text-sm text-neutral-700">Product details could not be loaded.</p>;
  }
  const product = parseProduct(data);
  if (!product) notFound();

  const canManage = business.role === 'owner' || business.role === 'manager';
  const canAdjust = canManage && !product.is_archived;
  const status = product.is_archived ? 'Archived'
    : product.quantity === 0 ? 'Out of stock'
      : product.quantity <= product.low_stock_threshold ? 'Low stock' : 'In stock';

  return (
    <>
      <InventoryPageHeader
        title={product.name}
        description={product.is_archived ? 'Archived product details and historical stock records.' : 'Product details and current stock balance.'}
        action={canManage && !product.is_archived ? { label: 'Edit product', href: `/products/${id}/edit` } : { label: 'Back to products', href: '/products' }}
      />
      <section aria-label="Product details" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ['Product code', product.sku || '—'], ['Category', product.category || '—'],
          ['Selling price', formatKes(product.selling_price)],
          ['Quantity on hand', String(product.quantity)], ['Stock status', status],
          ['Low-stock threshold', String(product.low_stock_threshold)],
          ...(canManage ? [
            ['Cost price', product.cost_price === null ? '—' : formatKes(product.cost_price)],
            ['Stock value at cost', product.cost_price === null ? '—' : formatKes(product.cost_price * product.quantity)],
          ] : []),
        ].map(([label, value]) => (
          <div key={label} className="rounded border border-neutral-200 p-4">
            <h2 className="text-xs font-medium text-neutral-600">{label}</h2>
            <p className="mt-2 text-sm font-semibold text-[#252525]">{value}</p>
          </div>
        ))}
      </section>
      {canAdjust ? (
        <section className="mt-8 max-w-xl rounded border border-neutral-200 p-4 sm:p-5">
          <h2 className="mb-4 text-base font-semibold">Adjust stock</h2>
          <StockAdjustmentForm productId={product.id} operationKey={randomUUID()} />
        </section>
      ) : null}
      {canManage && !product.is_archived ? (
        <form action={archiveProductAction} className="mt-8 border-t border-neutral-200 pt-5">
          <input type="hidden" name="product_id" value={product.id} />
          <h2 className="text-sm font-semibold">Archive product</h2>
          <p className="mt-1 text-sm text-neutral-600">Archiving hides this product from active lists and sales. Historical transactions remain intact.</p>
          <button type="submit" className="mt-3 min-h-10 rounded border border-neutral-300 px-3 text-sm font-medium">Archive product</button>
        </form>
      ) : null}
    </>
  );
}
