import Link from 'next/link';
import InventoryPageHeader from '../shared/InventoryPageHeader';
import { getActiveBusinessContext } from '@/lib/bizzflow/context';

const pageSize = 50;
const maxPage = 10_000;
const movementTypes = [
  'sale',
  'restock',
  'adjustment',
  'return',
  'correction',
  'damaged',
  'lost',
] as const;

type MovementType = (typeof movementTypes)[number];

function isMovementType(value: string | undefined): value is MovementType {
  return movementTypes.some((movementType) => movementType === value);
}

function formatMovementType(value: string) {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function movementDate(value: string) {
  return new Intl.DateTimeFormat('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Nairobi',
  }).format(new Date(value));
}

export default async function StockPage({
  searchParams,
}: {
  searchParams: { movement_type?: string; page?: string };
}) {
  const selectedType = isMovementType(searchParams.movement_type)
    ? searchParams.movement_type
    : undefined;
  const requestedPage = Number(searchParams.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= maxPage
    ? requestedPage
    : 1;
  const start = (page - 1) * pageSize;
  const { supabase, business } = await getActiveBusinessContext();
  let query = supabase
    .from('stock_movements')
    .select('id, product_id, movement_type, quantity_change, reason, sale_id, created_at', {
      count: 'exact',
    })
    .eq('business_id', business.id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(start, start + pageSize - 1);

  if (selectedType) {
    query = query.eq('movement_type', selectedType);
  }

  const { data: movements, error, count } = await query;
  const productIds = [...new Set((movements ?? []).map(({ product_id }) => product_id))];
  const { data: products, error: productsError } = productIds.length
    ? await supabase
      .from('products')
      .select('id, name')
      .eq('business_id', business.id)
      .in('id', productIds)
    : { data: [], error: null };
  const productNames = new Map((products ?? []).map(({ id, name }) => [id, name]));
  const totalPages = Math.ceil((count ?? 0) / pageSize);

  return (
    <>
      <InventoryPageHeader
        title="Stock activity"
        description={`Recorded inventory movements for ${business.name}.`}
        action={{ label: 'View products', href: '/products' }}
      />

      <form action="/stock" method="get" className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block text-sm font-medium text-[#252525]">
          Movement type
          <select
            name="movement_type"
            defaultValue={selectedType ?? ''}
            className="mt-1 min-h-11 rounded border border-neutral-300 bg-white px-3 text-sm"
          >
            <option value="">All movement types</option>
            {movementTypes.map((movementType) => (
              <option key={movementType} value={movementType}>
                {formatMovementType(movementType)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="min-h-11 rounded border border-neutral-300 bg-white px-4 text-sm font-medium text-[#252525] hover:bg-neutral-50"
        >
          Filter
        </button>
      </form>

      {error || productsError ? (
        <p role="alert" className="rounded border border-neutral-200 bg-[#F5F5F5] p-4 text-sm text-neutral-700">
          {error
            ? 'Stock activity could not be loaded. Confirm that the database migrations are applied and try again.'
            : 'Product names for stock activity could not be loaded. Refresh the page or contact your administrator.'}
        </p>
      ) : (
        <>
          <section aria-label="Stock movement history" className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-[#252525]">Movement history</h3>
              <p className="text-xs text-neutral-500">
                {count ?? 0} {(count ?? 0) === 1 ? 'record' : 'records'}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead className="bg-[#F5F5F5] text-xs uppercase text-neutral-600">
                  <tr>
                    <th scope="col" className="px-4 py-3">Date / time</th>
                    <th scope="col" className="px-4 py-3">Product</th>
                    <th scope="col" className="px-4 py-3">Movement</th>
                    <th scope="col" className="px-4 py-3 text-right">Change</th>
                    <th scope="col" className="px-4 py-3">Reason</th>
                    <th scope="col" className="px-4 py-3">Sale</th>
                  </tr>
                </thead>
                <tbody>
                  {(movements ?? []).map((movement) => {
                    const quantity = movement.quantity_change;
                    return (
                      <tr key={movement.id} className="border-t border-neutral-200">
                        <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                          {movementDate(movement.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/products/${movement.product_id}`}
                            className="font-medium text-[#B91C1C] underline"
                          >
                            {productNames.get(movement.product_id) ?? 'Product'}
                          </Link>
                        </td>
                        <td className="px-4 py-3">{formatMovementType(movement.movement_type)}</td>
                        <td className={`px-4 py-3 text-right font-semibold tabular-nums ${
                          quantity > 0 ? 'text-emerald-700' : 'text-[#252525]'
                        }`}>
                          {quantity > 0 ? '+' : ''}{quantity}
                        </td>
                        <td className="max-w-64 truncate px-4 py-3 text-neutral-600">
                          {movement.reason || '—'}
                        </td>
                        <td className="px-4 py-3">
                          {movement.sale_id
                            ? <Link href={`/sales/${movement.sale_id}`} className="text-[#B91C1C] underline">View sale</Link>
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {!movements?.length ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-neutral-600">
                        No stock movements found{selectedType ? ` for ${formatMovementType(selectedType).toLowerCase()}` : ''}.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <nav aria-label="Stock activity pages" className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-neutral-600">
              Page {page}{totalPages ? ` of ${totalPages}` : ''}
              {' · Select a product to review or adjust its stock.'}
            </p>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link
                  href={`/stock?${new URLSearchParams({
                    ...(selectedType ? { movement_type: selectedType } : {}),
                    page: String(page - 1),
                  }).toString()}`}
                  className="inline-flex min-h-10 items-center rounded border border-neutral-300 px-3 text-sm font-medium text-[#252525] no-underline hover:bg-neutral-50"
                >
                  Previous
                </Link>
              ) : null}
              {page < totalPages && page < maxPage ? (
                <Link
                  href={`/stock?${new URLSearchParams({
                    ...(selectedType ? { movement_type: selectedType } : {}),
                    page: String(page + 1),
                  }).toString()}`}
                  className="inline-flex min-h-10 items-center rounded border border-neutral-300 px-3 text-sm font-medium text-[#252525] no-underline hover:bg-neutral-50"
                >
                  Next
                </Link>
              ) : null}
            </div>
          </nav>
        </>
      )}
    </>
  );
}
