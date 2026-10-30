import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import InventoryPageHeader from '@/features/bizzflow/shared/InventoryPageHeader';
import SaleForm, { type SaleFormItem } from '@/features/bizzflow/operations/SaleForm';
import type { SaleProduct } from '@/features/bizzflow/operations/actions';
import { getActiveBusinessContext } from '@/lib/bizzflow/context';
import { jsonNumber, jsonObject, jsonString } from '@/lib/bizzflow/operations-data';

export default async function EditSalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { supabase, business } = await getActiveBusinessContext();
  const [{ data, error }, { data: account, error: accountError }, { data: payments, error: paymentError }] = await Promise.all([
    supabase.rpc('get_sale_detail_with_manual_items', { p_business_id: business.id, p_sale_id: id }),
    supabase.from('sale_accounts').select('sale_id, customer_name, customer_phone')
      .eq('business_id', business.id).eq('sale_id', id).maybeSingle(),
    supabase.from('sale_payments').select('amount')
      .eq('business_id', business.id).eq('sale_id', id),
  ]);

  if (error || accountError || paymentError) {
    return <p role="alert" className="text-sm text-neutral-700">Sale could not be loaded for editing.</p>;
  }
  if (!account) {
    return (
      <>
        <InventoryPageHeader title="Edit sale" description="This sale was recorded before payment tracking was enabled." />
        <p className="rounded border border-neutral-200 bg-[#F5F5F5] p-4 text-sm leading-6 text-neutral-700">
          Older sales can still be viewed, but cannot be edited safely because their payment history is not recorded.
        </p>
        <Link href={`/sales/${id}`} className="mt-4 inline-block text-sm text-[#E31E24] underline">Return to sale</Link>
      </>
    );
  }

  const response = jsonObject(data);
  const sale = jsonObject(response?.sale);
  if (!sale || jsonString(sale.id) !== id) notFound();
  const saleItems = Array.isArray(response?.items)
    ? response.items.map((item) => jsonObject(item)).filter((item): item is NonNullable<typeof item> => item !== null)
    : [];
  const productIds = saleItems
    .filter((item) => jsonString(item.kind) !== 'manual')
    .map((item) => jsonString(item.product_id))
    .filter((item): item is string => item !== null);
  const { data: inventory, error: inventoryError } = productIds.length
    ? await supabase.from('products').select('id, quantity').eq('business_id', business.id).in('id', productIds)
    : { data: [], error: null };
  if (inventoryError) {
    return <p role="alert" className="text-sm text-neutral-700">Product stock could not be loaded. Try again.</p>;
  }
  const stockByProduct = new Map((inventory ?? []).map(({ id: productId, quantity }) => [productId, quantity]));
  const initialItems: SaleFormItem[] = [];
  for (const item of saleItems) {
    const name = jsonString(item.product_name);
    const quantity = jsonNumber(item.quantity);
    const sellingPrice = jsonNumber(item.unit_price);
    if (!name || quantity === null || sellingPrice === null) continue;
    if (jsonString(item.kind) === 'manual') {
      initialItems.push({
        kind: 'manual' as const,
        lineId: jsonString(item.manual_line_id) ?? `${id}-${initialItems.length}`,
        name,
        quantity,
        unitPrice: sellingPrice,
        unitCost: jsonNumber(item.unit_cost_snapshot),
      });
      continue;
    }
    const productId = jsonString(item.product_id);
    if (!productId) continue;
    const product: SaleProduct = {
      id: productId,
      name,
      sku: null,
      quantity: stockByProduct.get(productId) ?? 0,
      selling_price: sellingPrice,
      cost_price: jsonNumber(item.unit_cost_snapshot),
    };
    initialItems.push({ kind: 'catalog', product, quantity });
  }
  const amountPaid = (payments ?? []).reduce((sum, payment) => sum + payment.amount, 0);

  return (
    <>
      <InventoryPageHeader title="Edit sale" description="Update products, quantities, payment received, or customer details." />
      <SaleForm
        initialIdempotencyKey={randomUUID()}
        saleId={id}
        initialItems={initialItems}
        initialAmountPaid={amountPaid}
        initialCustomerName={account.customer_name ?? ''}
        initialCustomerPhone={account.customer_phone ?? ''}
        initialPaymentMethod={jsonString(sale.payment_method) ?? 'cash'}
        canViewCosts
      />
    </>
  );
}
