import Link from 'next/link';
import InventoryPageHeader from '../shared/InventoryPageHeader';
import { getActiveBusinessContext } from '@/lib/bizzflow/context';
import { addCalendarDays } from '@/lib/bizzflow/operations-data';

type StockSearchParams = { type?: string; product?: string; from?: string; to?: string; page?: string | number };
const movementTypes = ['sale', 'restock', 'adjustment', 'return', 'correction', 'damaged', 'lost'] as const;
type MovementType = (typeof movementTypes)[number];
const isMovementType = (value: string | undefined): value is MovementType =>
  movementTypes.some((movementType) => movementType === value);
const validDate = (value: string | undefined) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};

function pageHref(params: StockSearchParams, page: number) {
  const query = new URLSearchParams();
  if (params.type) query.set('type', params.type);
  if (params.product) query.set('product', params.product);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  query.set('page', String(page));
  return `/stock?${query.toString()}`;
}

export default async function StockPage({ searchParams }: { searchParams: StockSearchParams }) {
  const movementType: MovementType | '' = isMovementType(searchParams.type) ? searchParams.type : '';
  const params = {
    type: movementType,
    product: /^[0-9a-f-]{36}$/i.test(searchParams.product ?? '') ? searchParams.product ?? '' : '',
    from: validDate(searchParams.from) ? searchParams.from! : '',
    to: validDate(searchParams.to) ? searchParams.to! : '',
    page: Math.max(1, Math.min(10000, Number.parseInt(String(searchParams.page ?? '1'), 10) || 1)),
  };
  const { supabase, business, user } = await getActiveBusinessContext();
  let movementsQuery = supabase.from('stock_movements').select(
    'id, business_id, product_id, movement_type, quantity_change, reason, created_by, created_at, sale_id',
    { count: 'exact' },
  ).eq('business_id', business.id).order('created_at', { ascending: false });
  if (params.type) movementsQuery = movementsQuery.eq('movement_type', params.type);
  if (params.product) movementsQuery = movementsQuery.eq('product_id', params.product);
  if (params.from) movementsQuery = movementsQuery.gte('created_at', new Date(`${params.from}T00:00:00+03:00`).toISOString());
  if (params.to) movementsQuery = movementsQuery.lt('created_at', new Date(`${addCalendarDays(params.to, 1)}T00:00:00+03:00`).toISOString());
  const [{ data: movements, count, error }, { data: productOptions, error: productError }] = await Promise.all([
    movementsQuery.range((params.page - 1) * 50, params.page * 50 - 1),
    supabase.from('products').select('id, name').eq('business_id', business.id).order('name').limit(200),
  ]);
  const productIds = [...new Set((movements ?? []).map(({ product_id }) => product_id))];
  const { data: pageProducts, error: pageProductsError } = productIds.length
    ? await supabase.from('products').select('id, name').eq('business_id', business.id).in('id', productIds)
    : { data: [], error: null };
  const productNames = new Map((pageProducts ?? []).map(({ id, name }) => [id, name]));

  return (
    <>
      <InventoryPageHeader title="Stock movements" description="Auditable additions, deductions, and adjustments. Stock balances change only through recorded operations." />
      {(error || productError || pageProductsError) ? (
        <p role="alert" className="rounded border border-neutral-200 bg-[#F5F5F5] p-4 text-sm text-neutral-700">Stock history could not be loaded. Check the database connection and migration.</p>
      ) : (
        <>
          <form method="get" className="mb-5 grid gap-3 rounded border border-neutral-200 p-3 sm:grid-cols-2 lg:grid-cols-5">
            <div><label htmlFor="type" className="mb-1 block text-xs font-medium">Movement type</label><select id="type" name="type" defaultValue={params.type} className="min-h-10 w-full rounded border border-neutral-300 bg-white px-2 text-sm"><option value="">All movements</option>{movementTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></div>
            <div><label htmlFor="product" className="mb-1 block text-xs font-medium">Product</label><select id="product" name="product" defaultValue={params.product} className="min-h-10 w-full rounded border border-neutral-300 bg-white px-2 text-sm"><option value="">All products</option>{productOptions?.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}</select></div>
            <div><label htmlFor="from" className="mb-1 block text-xs font-medium">From</label><input id="from" name="from" type="date" defaultValue={params.from} className="min-h-10 w-full rounded border border-neutral-300 px-2 text-sm" /></div>
            <div><label htmlFor="to" className="mb-1 block text-xs font-medium">To (inclusive)</label><input id="to" name="to" type="date" defaultValue={params.to} className="min-h-10 w-full rounded border border-neutral-300 px-2 text-sm" /></div>
            <div className="flex items-end gap-3"><button className="min-h-10 rounded bg-[#E31E24] px-4 text-sm font-medium !text-white hover:!text-white">Filter</button><Link href="/stock" className="self-center text-sm text-[#E31E24] underline">Clear</Link></div>
          </form>
          <div className="overflow-hidden rounded border border-neutral-200">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-[#F5F5F5] text-xs uppercase text-neutral-600"><tr><th className="px-4 py-3">Date & time</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">Movement</th><th className="px-4 py-3">Change</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3">Recorded by</th></tr></thead>
                <tbody>
                  {movements?.map((movement) => (
                    <tr key={movement.id} className="border-t border-neutral-200">
                      <td className="px-4 py-3">{new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Nairobi' }).format(new Date(movement.created_at))}</td>
                      <td className="px-4 py-3">{productNames.get(movement.product_id) ?? 'Archived product'}</td>
                      <td className="px-4 py-3">{movement.movement_type}</td>
                      <td className="px-4 py-3 font-medium">{movement.quantity_change > 0 ? '+' : ''}{movement.quantity_change}</td>
                      <td className="max-w-56 truncate px-4 py-3">{movement.reason || (movement.sale_id ? `Sale ${movement.sale_id.slice(0, 8)}` : '—')}</td>
                      <td className="px-4 py-3">{movement.created_by === user.id ? 'You' : 'Staff member'}</td>
                    </tr>
                  ))}
                  {!movements?.length ? <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-neutral-600">No stock movements in this range.</td></tr> : null}
                </tbody>
              </table>
            </div>
            {count && count > 50 ? <nav aria-label="Stock movement pages" className="flex items-center justify-between border-t border-neutral-200 px-4 py-3 text-sm">
              {params.page > 1 ? <Link href={pageHref(params, params.page - 1)} className="text-[#E31E24] underline">Previous</Link> : <span />}
              <span>Page {params.page} of {Math.ceil(count / 50)}</span>
              {params.page * 50 < count ? <Link href={pageHref(params, params.page + 1)} className="text-[#E31E24] underline">Next</Link> : <span />}
            </nav> : null}
          </div>
        </>
      )}
    </>
  );
}
