import { notFound } from 'next/navigation';
import Link from 'next/link';
import InventoryPageHeader from '@/features/bizzflow/shared/InventoryPageHeader';
import { getActiveBusinessContext } from '@/lib/bizzflow/context';
import { formatKes, jsonNumber, jsonObject, jsonString } from '@/lib/bizzflow/operations-data';

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, business, user } = await getActiveBusinessContext();
  const { data, error } = await supabase.rpc('get_sale_detail_with_manual_items', {
    p_business_id: business.id,
    p_sale_id: id,
  });
  if (error) {
    return <p role="alert" className="text-sm text-neutral-700">Sale details could not be loaded or are not available to this account.</p>;
  }

  const response = jsonObject(data);
  const sale = jsonObject(response?.sale);
  const saleId = jsonString(sale?.id);
  const createdAt = jsonString(sale?.created_at);
  const createdBy = jsonString(sale?.created_by);
  const total = jsonNumber(sale?.total_amount);
  if (!saleId || !createdAt || total === null) notFound();
  const items = Array.isArray(response?.items)
    ? response.items.map((item) => jsonObject(item)).filter((item): item is NonNullable<typeof item> => item !== null)
    : [];
  const [{ data: account, error: accountError }, { data: payments, error: paymentError }] = await Promise.all([
    supabase.from('sale_accounts').select('customer_name, customer_phone')
      .eq('business_id', business.id).eq('sale_id', id).maybeSingle(),
    supabase.from('sale_payments').select('amount, payment_method, created_at')
      .eq('business_id', business.id).eq('sale_id', id).order('created_at'),
  ]);
  if (accountError || paymentError) {
    return <p role="alert" className="text-sm text-neutral-700">Payment details could not be loaded. Check the latest MSONJO sales migration.</p>;
  }
  const amountPaid = account
    ? (payments ?? []).reduce((sum, payment) => sum + payment.amount, 0)
    : total;
  const balanceDue = Math.max(0, total - amountPaid);

  return (
    <>
      <InventoryPageHeader
        title="Sale details"
        description={`Recorded ${new Intl.DateTimeFormat('en-KE', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Nairobi' }).format(new Date(createdAt))}.`}
        action={account ? { label: 'Edit sale', href: `/sales/${id}/edit` } : undefined}
      />
      <dl className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border border-neutral-200 p-4"><dt className="text-xs text-neutral-600">Reference</dt><dd className="mt-1 break-all text-sm font-medium">{saleId}</dd></div>
        <div className="rounded border border-neutral-200 p-4"><dt className="text-xs text-neutral-600">Payment method</dt><dd className="mt-1 text-sm font-medium">{jsonString(sale?.payment_method) === 'mpesa' ? 'M-Pesa (manual record)' : jsonString(sale?.payment_method) ?? 'Not recorded'}</dd></div>
        <div className="rounded border border-neutral-200 p-4"><dt className="text-xs text-neutral-600">Recorded by</dt><dd className="mt-1 text-sm font-medium">{createdBy === user.id ? 'You' : createdBy ? 'Staff member' : 'Former staff member'}</dd></div>
        <div className="rounded border border-neutral-200 p-4"><dt className="text-xs text-neutral-600">Total paid / remaining</dt><dd className="mt-1 text-sm font-medium">{formatKes(amountPaid)} / {formatKes(balanceDue)}</dd></div>
      </dl>
      {account?.customer_name ? (
        <p className="mb-5 text-sm text-neutral-700">Customer: <strong>{account.customer_name}</strong> · {account.customer_phone}</p>
      ) : null}
      {payments?.length ? (
        <section className="mb-6 rounded border border-neutral-200">
          <h2 className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold">Payments received</h2>
          <ul className="divide-y divide-neutral-200">
            {payments.map((payment, index) => (
              <li key={`${payment.created_at}-${index}`} className="flex justify-between gap-3 px-4 py-3 text-sm">
                <span>{new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Nairobi' }).format(new Date(payment.created_at))} · {payment.payment_method}</span>
                <strong>{formatKes(payment.amount)}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="overflow-x-auto rounded border border-neutral-200">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="bg-[#F5F5F5] text-xs uppercase text-neutral-600"><tr><th className="px-4 py-3">Item</th><th className="px-4 py-3">Qty</th><th className="px-4 py-3">Unit price</th><th className="px-4 py-3">Subtotal</th><th className="px-4 py-3">Cost at sale</th></tr></thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={jsonString(item.product_id) ?? index} className="border-t border-neutral-200">
                <td className="px-4 py-3">{jsonString(item.product_name) ?? (jsonString(item.kind) === 'manual' ? 'Manual item' : 'Archived product')}</td>
                <td className="px-4 py-3">{jsonNumber(item.quantity) ?? 0}</td>
                <td className="px-4 py-3">{formatKes(jsonNumber(item.unit_price) ?? 0)}</td>
                <td className="px-4 py-3">{formatKes(jsonNumber(item.subtotal) ?? 0)}</td>
                <td className="px-4 py-3">{jsonNumber(item.unit_cost_snapshot) === null ? '—' : `${formatKes(jsonNumber(item.unit_cost_snapshot)!)} / unit`}</td>
              </tr>
            ))}
            {!items.length ? <tr><td colSpan={5} className="px-4 py-8 text-center text-neutral-600">No sale items found.</td></tr> : null}
          </tbody>
          <tfoot><tr className="border-t border-neutral-200 font-semibold"><th colSpan={3} className="px-4 py-4 text-right">Sale total</th><td colSpan={2} className="px-4 py-4">{formatKes(total)}</td></tr></tfoot>
        </table>
      </div>
      <Link href="/sales" className="mt-5 inline-block text-sm text-[#E31E24] underline">Back to sales</Link>
    </>
  );
}
