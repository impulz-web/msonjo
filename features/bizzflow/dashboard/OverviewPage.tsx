import Link from 'next/link';
import InventoryPageHeader from '../shared/InventoryPageHeader';
import LiveBusinessRefresh from './LiveBusinessRefresh';
import { getActiveBusinessContext } from '@/lib/bizzflow/context';
import { getSupabaseConfig, isSupabasePublishableKey } from '@/lib/supabase/config';
import { formatKes, jsonNumber, jsonObject, jsonString } from '@/lib/bizzflow/operations-data';

function arrayOfObjects(value: import('@/lib/database.types').Json | undefined) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => jsonObject(entry)).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

export default async function OverviewPage() {
  const { supabase, business } = await getActiveBusinessContext();
  const supabaseConfig = getSupabaseConfig();
  const { data, error } = await supabase.rpc('get_business_dashboard', { p_business_id: business.id });
  const dashboard = error ? null : jsonObject(data);
  const shortcuts = [
    { label: 'Products', description: 'Browse, search, and manage your items.', href: '/products' },
    { label: 'Stock movements', description: 'Review stock changes and adjustments.', href: '/stock' },
    { label: 'Sales history', description: 'Review completed transactions.', href: '/sales' },
    { label: 'Reports', description: 'See sales and inventory summaries.', href: '/reports' },
  ];
  const summary = dashboard ? [
    ['Products', String(jsonNumber(dashboard.active_products) ?? 0)],
    ['Units in stock', String(jsonNumber(dashboard.stock_units) ?? 0)],
    ["Sales today", formatKes(jsonNumber(dashboard.today_sales) ?? 0)],
    ['Needs attention', String(
      (jsonNumber(dashboard.low_stock_count) ?? 0)
      + (jsonNumber(dashboard.out_of_stock_count) ?? 0),
    )],
  ] : [];

  return (
    <>
      <InventoryPageHeader
        title="Overview"
        description={`Business overview for ${business.name}.`}
      />
      <div className="mb-6 flex flex-wrap gap-2">
        {(business.role === 'owner' || business.role === 'manager') ? (
          <Link
            href="/products/new"
            className="inline-flex min-h-10 items-center justify-center rounded border border-neutral-300 px-4 text-sm font-medium text-[#252525] no-underline hover:bg-[#F5F5F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E31E24]"
          >
            Add product
          </Link>
        ) : null}
        <Link
          href="/sales/new"
          className="inline-flex min-h-10 items-center justify-center rounded bg-[#E31E24] px-4 text-sm font-medium !text-white no-underline hover:bg-[#E31E24] hover:!text-white focus-visible:!text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E31E24]"
        >
          Record sale
        </Link>
      </div>

      <section aria-label="Business tools" className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {shortcuts.map(({ label, description, href }) => (
          <Link
            key={href}
            href={href}
            className="rounded border border-neutral-200 p-4 text-[#252525] no-underline hover:border-[#E31E24] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E31E24]"
          >
            <h2 className="text-sm font-semibold">{label}</h2>
            <p className="mt-1 text-sm leading-5 text-neutral-600">{description}</p>
          </Link>
        ))}
      </section>

      {error || !dashboard ? (
        <div role="alert" className="rounded border border-neutral-200 bg-[#F5F5F5] p-4 text-sm leading-6 text-neutral-700">
          Dashboard figures and activity could not be loaded. Confirm that the MSONJO operations/reporting migration is applied to the dedicated project and then refresh this page.
        </div>
      ) : (
        <>
          <div className="mb-4 flex justify-end">
            <LiveBusinessRefresh
              businessId={business.id}
              supabaseUrl={supabaseConfig?.url}
              publishableKey={supabaseConfig && isSupabasePublishableKey(supabaseConfig.key)
                ? supabaseConfig.key
                : undefined}
            />
          </div>
          <section aria-label="Business summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summary.map(([label, value]) => (
              <div key={label} className="rounded border border-neutral-200 bg-white p-4">
                <h2 className="text-sm font-medium text-neutral-700">{label}</h2>
                <p className="mt-3 text-2xl font-semibold text-[#252525]">{value}</p>
              </div>
            ))}
          </section>
          <p className="mt-2 text-xs text-neutral-600">
            {jsonNumber(dashboard.low_stock_count) ?? 0} low-stock · {jsonNumber(dashboard.out_of_stock_count) ?? 0} out of stock · {jsonNumber(dashboard.today_sale_count) ?? 0} sales today
            {jsonNumber(dashboard.stock_value) !== null
              ? ` · Stock value at cost ${formatKes(jsonNumber(dashboard.stock_value)!)}`
              : ''}
          </p>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <section className="rounded border border-neutral-200 bg-white">
              <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-4">
                <h2 className="text-sm font-semibold text-[#252525]">Restock attention</h2>
                <Link href="/products?stock=low" className="text-sm text-[#E31E24] underline">View products</Link>
              </div>
              <ul className="divide-y divide-neutral-200">
                {arrayOfObjects(dashboard.low_stock).map((item) => {
                  const id = jsonString(item.id);
                  return (
                    <li key={id ?? jsonString(item.name)} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <Link href={`/products/${id}`} className="min-w-0 truncate font-medium text-[#E31E24] underline">{jsonString(item.name) ?? 'Product'}</Link>
                      <span className="shrink-0 text-neutral-600">{jsonNumber(item.quantity) ?? 0} / {jsonNumber(item.threshold) ?? 0} threshold</span>
                    </li>
                  );
                })}
                {!arrayOfObjects(dashboard.low_stock).length ? <li className="px-4 py-8 text-center text-sm text-neutral-600">No products need restocking.</li> : null}
              </ul>
            </section>

            <section className="rounded border border-neutral-200 bg-white">
              <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-4">
                <h2 className="text-sm font-semibold text-[#252525]">Recent sales</h2>
                <Link href="/sales" className="text-sm text-[#E31E24] underline">Sales history</Link>
              </div>
              <ul className="divide-y divide-neutral-200">
                {arrayOfObjects(dashboard.recent_sales).map((sale) => {
                  const id = jsonString(sale.id);
                  const createdAt = jsonString(sale.created_at);
                  return (
                    <li key={id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <div>
                        <Link href={`/sales/${id}`} className="font-medium text-[#E31E24] underline">{id?.slice(0, 8)}</Link>
                        <p className="mt-1 text-xs text-neutral-600">{createdAt ? new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Nairobi' }).format(new Date(createdAt)) : ''} · {jsonString(sale.payment_method) ?? 'Not recorded'}</p>
                      </div>
                      <span className="font-medium">{formatKes(jsonNumber(sale.total_amount) ?? 0)}</span>
                    </li>
                  );
                })}
                {!arrayOfObjects(dashboard.recent_sales).length ? <li className="px-4 py-8 text-center text-sm text-neutral-600">No sales recorded yet.</li> : null}
              </ul>
            </section>

            <section className="rounded border border-neutral-200 bg-white lg:col-span-2">
              <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-4">
                <h2 className="text-sm font-semibold text-[#252525]">Recent stock movements</h2>
                <Link href="/stock" className="text-sm text-[#E31E24] underline">Movement history</Link>
              </div>
              <ul className="divide-y divide-neutral-200 sm:grid sm:grid-cols-2">
                {arrayOfObjects(dashboard.recent_movements).map((movement) => (
                  <li key={jsonString(movement.id)} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0 truncate">{jsonString(movement.product_name) ?? 'Product'} · {jsonString(movement.movement_type) ?? 'movement'}</span>
                    <span className="shrink-0 font-medium">{(jsonNumber(movement.quantity_change) ?? 0) > 0 ? '+' : ''}{jsonNumber(movement.quantity_change) ?? 0}</span>
                  </li>
                ))}
                {!arrayOfObjects(dashboard.recent_movements).length ? <li className="px-4 py-8 text-center text-sm text-neutral-600 sm:col-span-2">No stock movements recorded yet.</li> : null}
              </ul>
            </section>
          </div>
        </>
      )}
    </>
  );
}
