import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Boxes,
  Package,
  Plus,
  ShoppingCart,
} from 'lucide-react';
import Link from 'next/link';
import LiveBusinessRefresh from './LiveBusinessRefresh';
import type { AuthorizedBusiness } from '@/lib/bizzflow/businesses';
import type { Json } from '@/lib/database.types';
import { getActiveBusinessContext } from '@/lib/bizzflow/context';
import { isLocalDashboardPreview } from '@/lib/bizzflow/local-preview';
import { getSupabaseConfig, isSupabasePublishableKey } from '@/lib/supabase/config';
import { formatKes, jsonNumber, jsonObject, jsonString } from '@/lib/bizzflow/operations-data';

function arrayOfObjects(value: import('@/lib/database.types').Json | undefined) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => jsonObject(entry))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

function localDate(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Nairobi',
  }).format(new Date(value));
}

function movementLabel(value: string | null) {
  if (!value) return 'Stock update';
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default async function OverviewPage() {
  const previewMode = isLocalDashboardPreview();
  let business: AuthorizedBusiness;
  let dashboard: Record<string, Json | undefined> | null;
  let loadFailed = false;
  let supabaseConfig: ReturnType<typeof getSupabaseConfig> = null;

  if (previewMode) {
    business = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'MSONJO GAS & HOUSE HOLD',
      slug: 'msonjo-gas-house-hold',
      role: 'owner',
    };
    dashboard = null;
  } else {
    const context = await getActiveBusinessContext();
    business = context.business;
    supabaseConfig = getSupabaseConfig();
    const { data, error } = await context.supabase.rpc('get_business_dashboard', {
      p_business_id: business.id,
    });
    dashboard = error ? null : jsonObject(data);
    loadFailed = Boolean(error);
  }

  const lowStock = arrayOfObjects(dashboard?.low_stock);
  const recentSales = arrayOfObjects(dashboard?.recent_sales);
  const recentMovements = arrayOfObjects(dashboard?.recent_movements);
  const lowStockCount = jsonNumber(dashboard?.low_stock_count) ?? 0;
  const outOfStockCount = jsonNumber(dashboard?.out_of_stock_count) ?? 0;
  const metrics = [
    {
      label: 'Sales today',
      value: formatKes(jsonNumber(dashboard?.today_sales) ?? 0),
      detail: `${jsonNumber(dashboard?.today_sale_count) ?? 0} completed sales`,
      icon: Banknote,
      color: 'bg-red-50 text-[#C81E24]',
      valueClass: 'text-[clamp(1.25rem,5vw,1.875rem)]',
    },
    {
      label: 'Active products',
      value: String(jsonNumber(dashboard?.active_products) ?? 0),
      detail: 'Available in your catalog',
      icon: Package,
      color: 'bg-slate-100 text-slate-700',
      valueClass: 'text-2xl sm:text-3xl',
    },
    {
      label: 'Units in stock',
      value: String(jsonNumber(dashboard?.stock_units) ?? 0),
      detail: 'Across active products',
      icon: Boxes,
      color: 'bg-blue-50 text-blue-700',
      valueClass: 'text-2xl sm:text-3xl',
    },
    {
      label: 'Stock attention',
      value: String(lowStockCount + outOfStockCount),
      detail: `${outOfStockCount} out of stock · ${lowStockCount} low`,
      icon: AlertTriangle,
      color: lowStockCount + outOfStockCount > 0
        ? 'bg-amber-50 text-amber-800'
        : 'bg-emerald-50 text-emerald-700',
      valueClass: 'text-2xl sm:text-3xl',
    },
  ];

  return (
    <div className="space-y-6 sm:space-y-8">
      <header className="flex flex-col gap-4 border-b border-neutral-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
            Business overview
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#252525] sm:text-3xl">
            Dashboard
          </h2>
          <p className="mt-1 truncate text-sm text-neutral-600">{business.name}</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Link
            href="/products/new"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-4 text-sm font-semibold text-[#252525] no-underline transition hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E31E24]"
          >
            <Plus aria-hidden="true" className="size-4" />
            Add product
          </Link>
          <Link
            href="/sales/new"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#E31E24] px-4 text-sm font-semibold !text-white no-underline transition hover:bg-[#C81E24] hover:!text-white focus-visible:!text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E31E24]"
          >
            <ShoppingCart aria-hidden="true" className="size-4" />
            Record a sale
          </Link>
        </div>
      </header>

      {!previewMode ? (
        <div className="flex min-h-6 items-center justify-between gap-3">
          <p className="text-xs text-neutral-500">
            Updated for {new Intl.DateTimeFormat('en-KE', {
              dateStyle: 'full',
              timeZone: 'Africa/Nairobi',
            }).format(new Date())}
          </p>
          <LiveBusinessRefresh
            businessId={business.id}
            supabaseUrl={supabaseConfig?.url}
            publishableKey={supabaseConfig && isSupabasePublishableKey(supabaseConfig.key)
              ? supabaseConfig.key
              : undefined}
          />
        </div>
      ) : null}

      {previewMode ? (
        <section
          aria-labelledby="dashboard-empty-title"
          className="rounded-lg border border-neutral-200 bg-white px-5 py-12 text-center shadow-sm sm:px-8"
        >
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <Activity aria-hidden="true" className="size-6" />
          </span>
          <h3 id="dashboard-empty-title" className="mt-4 text-base font-semibold text-[#252525]">
            Your business dashboard
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-600">
            Live sales, inventory, and stock activity will appear here when your business data is connected.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Link
              href="/products/new"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-4 text-sm font-semibold text-[#252525] no-underline transition hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E31E24]"
            >
              <Plus aria-hidden="true" className="size-4" />
              Add your first product
            </Link>
            <Link
              href="/sales/new"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#E31E24] px-4 text-sm font-semibold !text-white no-underline transition hover:bg-[#C81E24] hover:!text-white focus-visible:!text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E31E24]"
            >
              <ShoppingCart aria-hidden="true" className="size-4" />
              Record a sale
            </Link>
          </div>
        </section>
      ) : loadFailed || !dashboard ? (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          Dashboard figures and activity could not be loaded. Refresh the page or contact your administrator if the problem continues.
        </div>
      ) : (
        <>
          <section aria-label="Business summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {metrics.map(({ label, value, detail, icon: Icon, color, valueClass }) => (
              <article
                key={label}
                className="min-w-0 rounded-lg border border-neutral-200 bg-white p-3 shadow-sm sm:p-5"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate text-xs font-medium text-neutral-600 sm:text-sm">{label}</h3>
                  <span className={`flex size-8 shrink-0 items-center justify-center rounded-md sm:size-9 ${color}`}>
                    <Icon aria-hidden="true" className="size-4 sm:size-[18px]" />
                  </span>
                </div>
                <p className={`mt-3 truncate font-bold tracking-tight text-[#252525] sm:mt-4 ${valueClass}`}>
                  {value}
                </p>
                <p className="mt-1 truncate text-[11px] text-neutral-500 sm:text-xs">{detail}</p>
              </article>
            ))}
          </section>

          {jsonNumber(dashboard.stock_value) !== null ? (
            <p className="flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600 sm:w-fit sm:px-4">
              <Boxes aria-hidden="true" className="size-4 shrink-0" />
              Inventory value at cost
              <strong className="ml-auto text-sm text-[#252525] sm:ml-2">
                {formatKes(jsonNumber(dashboard.stock_value)!)}
              </strong>
            </p>
          ) : null}

          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <section className="min-w-0 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-4 sm:px-5">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[#252525] sm:text-base">Stock to review</h3>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {lowStockCount + outOfStockCount
                      ? `${outOfStockCount} out of stock · ${lowStockCount} low`
                      : 'Inventory health'}
                  </p>
                </div>
                <Link
                  href="/products?stock=low"
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#B91C1C] no-underline hover:underline sm:text-sm"
                >
                  View all <ArrowRight aria-hidden="true" className="size-3.5" />
                </Link>
              </div>
              {lowStock.length ? (
                <ul className="divide-y divide-neutral-100">
                  {lowStock.map((item) => {
                    const id = jsonString(item.id);
                    const name = jsonString(item.name) ?? 'Product';
                    const quantity = jsonNumber(item.quantity) ?? 0;
                    const threshold = jsonNumber(item.threshold) ?? 0;
                    const isOut = quantity <= 0;
                    return (
                      <li key={id ?? name}>
                        {previewMode ? (
                          <div className="flex min-h-14 items-center gap-3 px-4 py-3 text-sm sm:px-5">
                            <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${isOut ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
                              {isOut
                                ? <AlertTriangle aria-hidden="true" className="size-4" />
                                : <Package aria-hidden="true" className="size-4" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-[#252525]">{name}</span>
                              <span className={`mt-0.5 block text-xs ${isOut ? 'text-red-700' : 'text-neutral-500'}`}>
                                {isOut ? 'Out of stock' : 'Low stock'}
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className="block font-semibold tabular-nums text-[#252525]">{quantity}</span>
                              <span className="text-[11px] text-neutral-500">of {threshold}</span>
                            </span>
                          </div>
                        ) : (
                          <Link
                            href={`/products/${id}`}
                            className="flex min-h-14 items-center gap-3 px-4 py-3 text-sm no-underline transition hover:bg-neutral-50 sm:px-5"
                          >
                          <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${isOut ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
                            {isOut
                              ? <AlertTriangle aria-hidden="true" className="size-4" />
                              : <Package aria-hidden="true" className="size-4" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-[#252525]">{name}</span>
                            <span className={`mt-0.5 block text-xs ${isOut ? 'text-red-700' : 'text-neutral-500'}`}>
                              {isOut ? 'Out of stock' : 'Low stock'}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block font-semibold tabular-nums text-[#252525]">{quantity}</span>
                            <span className="text-[11px] text-neutral-500">of {threshold}</span>
                          </span>
                          <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-neutral-400" />
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="px-5 py-10 text-center">
                  <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                    <Package aria-hidden="true" className="size-5" />
                  </span>
                  <p className="mt-3 text-sm font-medium text-[#252525]">Stock levels look good</p>
                  <p className="mt-1 text-xs text-neutral-500">No products currently need restocking.</p>
                </div>
              )}
            </section>

            <section className="min-w-0 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-4 sm:px-5">
                <div>
                  <h3 className="text-sm font-semibold text-[#252525] sm:text-base">Recent sales</h3>
                  <p className="mt-0.5 text-xs text-neutral-500">Latest completed transactions</p>
                </div>
                <Link
                  href="/sales"
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#B91C1C] no-underline hover:underline sm:text-sm"
                >
                  Sales history <ArrowRight aria-hidden="true" className="size-3.5" />
                </Link>
              </div>
              {recentSales.length ? (
                <ul className="divide-y divide-neutral-100">
                  {recentSales.map((sale) => {
                    const id = jsonString(sale.id);
                    const createdAt = jsonString(sale.created_at);
                    return (
                      <li key={id ?? createdAt}>
                        {previewMode ? (
                          <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-[#252525]">
                                Sale {id?.slice(0, 8) ?? '—'}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-neutral-500">
                                {localDate(createdAt)} · {jsonString(sale.payment_method) ?? 'Not recorded'}
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className="block font-semibold tabular-nums text-[#252525]">
                                {formatKes(jsonNumber(sale.total_amount) ?? 0)}
                              </span>
                            </span>
                          </div>
                        ) : (
                          <Link
                            href={`/sales/${id}`}
                            className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 text-sm no-underline transition hover:bg-neutral-50 sm:px-5"
                          >
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-[#252525]">
                              Sale {id?.slice(0, 8) ?? '—'}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-neutral-500">
                              {localDate(createdAt)} · {jsonString(sale.payment_method) ?? 'Not recorded'}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block font-semibold tabular-nums text-[#252525]">
                              {formatKes(jsonNumber(sale.total_amount) ?? 0)}
                            </span>
                            <ArrowUpRight aria-hidden="true" className="ml-auto mt-0.5 size-3.5 text-neutral-400" />
                          </span>
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="px-5 py-10 text-center">
                  <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-600">
                    <ShoppingCart aria-hidden="true" className="size-5" />
                  </span>
                  <p className="mt-3 text-sm font-medium text-[#252525]">No sales recorded</p>
                  <p className="mt-1 text-xs text-neutral-500">Completed sales will appear here.</p>
                </div>
              )}
            </section>

            <section className="min-w-0 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm xl:col-span-2">
              <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-4 sm:px-5">
                <span className="flex size-8 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                  <Activity aria-hidden="true" className="size-4" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-[#252525] sm:text-base">Recent stock activity</h3>
                  <p className="mt-0.5 text-xs text-neutral-500">Latest stock changes</p>
                </div>
              </div>
              {recentMovements.length ? (
                <ul className="divide-y divide-neutral-100 sm:grid sm:grid-cols-2 sm:divide-y-0 sm:[&>li:nth-child(n+3)]:border-t sm:[&>li:nth-child(even)]:border-l">
                  {recentMovements.map((movement) => {
                    const id = jsonString(movement.id);
                    const quantity = jsonNumber(movement.quantity_change) ?? 0;
                    const isIncrease = quantity > 0;
                    return (
                      <li key={id}>
                        <div className="flex min-h-16 items-center gap-3 px-4 py-3 sm:px-5">
                          <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${isIncrease ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                            {isIncrease
                              ? <ArrowDownToLine aria-hidden="true" className="size-4" />
                              : <ArrowUpRight aria-hidden="true" className="size-4" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-[#252525]">
                              {jsonString(movement.product_name) ?? 'Product'}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-neutral-500">
                              {movementLabel(jsonString(movement.movement_type))} · {localDate(jsonString(movement.created_at))}
                            </span>
                          </span>
                          <span className={`shrink-0 font-semibold tabular-nums ${isIncrease ? 'text-emerald-700' : 'text-[#252525]'}`}>
                            {quantity > 0 ? '+' : ''}{quantity}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="px-5 py-8 text-center text-sm text-neutral-500">
                  Stock changes will appear here as operations are recorded.
                </div>
              )}
            </section>
          </div>

          {!previewMode ? <section aria-label="Quick links" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              { href: '/products', label: 'Manage products', description: 'Browse the full product catalog.', icon: Package },
              { href: '/stock', label: 'Review stock activity', description: 'Audit recorded stock changes.', icon: Activity },
              { href: '/reports', label: 'View reports', description: 'Review sales and inventory performance.', icon: Banknote },
            ].map(({ href, label, description, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex min-h-16 items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-[#252525] no-underline transition hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E31E24]"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="mt-0.5 block truncate text-xs text-neutral-500">{description}</span>
                </span>
                <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-neutral-400 transition group-hover:translate-x-0.5" />
              </Link>
            ))}
          </section> : null}
        </>
      )}
    </div>
  );
}
