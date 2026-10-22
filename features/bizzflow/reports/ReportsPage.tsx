import Link from 'next/link';
import InventoryPageHeader from '../shared/InventoryPageHeader';
import { getActiveBusinessContext } from '@/lib/bizzflow/context';
import { addCalendarDays, formatKes, getNairobiDate, jsonNumber, jsonObject, jsonString } from '@/lib/bizzflow/operations-data';

type ReportSearchParams = { period?: string; from?: string; to?: string };

function isValidDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function startOfWeek(value: string) {
  const day = new Date(`${value}T12:00:00Z`).getUTCDay();
  return addCalendarDays(value, day === 0 ? -6 : 1 - day);
}

function startOfNextMonth(value: string) {
  const [year, month] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month, 1, 12)).toISOString().slice(0, 10);
}

export default async function ReportsPage({ searchParams }: { searchParams: ReportSearchParams }) {
  const params = await Promise.resolve(searchParams);
  const today = getNairobiDate();
  const period = ['day', 'week', 'month', 'custom'].includes(params.period ?? '') ? params.period ?? 'month' : 'month';
  let startDate = addCalendarDays(today, -new Date(`${today}T12:00:00Z`).getUTCDate() + 1);
  let endDate = startOfNextMonth(today);
  let dateError = '';
  if (period === 'day') {
    startDate = today;
    endDate = addCalendarDays(today, 1);
  } else if (period === 'week') {
    startDate = startOfWeek(today);
    endDate = addCalendarDays(startDate, 7);
  } else if (period === 'custom') {
    if (!isValidDate(params.from) || !isValidDate(params.to)) {
      dateError = 'Choose a valid start and end date.';
    } else if (params.to < params.from || (Date.parse(`${params.to}T12:00:00Z`) - Date.parse(`${params.from}T12:00:00Z`)) / 86400000 >= 366) {
      dateError = 'Choose an inclusive date range of no more than 366 days.';
    } else {
      startDate = params.from;
      endDate = addCalendarDays(params.to, 1);
    }
  }

  const { supabase, business } = await getActiveBusinessContext();
  const result = dateError ? null : await supabase.rpc('get_business_reports', {
    p_business_id: business.id,
    p_start_date: startDate,
    p_end_date: endDate,
  });
  const error = dateError || result?.error;
  const data = result?.data;
  const report = error ? null : jsonObject(data);
  const inventory = jsonObject(report?.inventory);
  const dailyRows = Array.isArray(report?.sales_by_day) ? report.sales_by_day.map((row) => jsonObject(row)).filter((row): row is NonNullable<typeof row> => row !== null) : [];
  const productRows = Array.isArray(report?.sales_by_product) ? report.sales_by_product.map((row) => jsonObject(row)).filter((row): row is NonNullable<typeof row> => row !== null) : [];
  const lowStockRows = Array.isArray(report?.low_stock_products) ? report.low_stock_products.map((row) => jsonObject(row)).filter((row): row is NonNullable<typeof row> => row !== null) : [];

  return (
    <>
      <InventoryPageHeader title="Reports" description="Business performance and inventory valuation. Times use Africa/Nairobi; selected end dates are inclusive." />
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded border border-neutral-200 p-3">
        <div><label htmlFor="period" className="mb-1 block text-xs font-medium">Period</label><select id="period" name="period" defaultValue={period} className="min-h-10 rounded border border-neutral-300 bg-white px-2 text-sm"><option value="day">Today</option><option value="week">This week</option><option value="month">This month</option><option value="custom">Custom range</option></select></div>
        {period === 'custom' ? <>
          <div><label htmlFor="from" className="mb-1 block text-xs font-medium">From</label><input id="from" name="from" type="date" defaultValue={params.from} required className="min-h-10 rounded border border-neutral-300 px-2 text-sm" /></div>
          <div><label htmlFor="to" className="mb-1 block text-xs font-medium">To (inclusive)</label><input id="to" name="to" type="date" defaultValue={params.to} required className="min-h-10 rounded border border-neutral-300 px-2 text-sm" /></div>
        </> : null}
        <button className="min-h-10 rounded bg-[#E31E24] px-4 text-sm font-medium !text-white hover:!text-white">Run report</button>
        <p className="text-xs text-neutral-600">Date range: {startDate} inclusive to {endDate} exclusive</p>
        {!dateError ? (
          <Link
            href={`/reports/pdf?from=${startDate}&to=${addCalendarDays(endDate, -1)}`}
            className="inline-flex min-h-10 items-center rounded bg-[#E31E24] px-4 text-sm font-medium !text-white hover:!text-white"
          >
            Download period PDF
          </Link>
        ) : null}
      </form>

      {error || !report ? (
        <p role="alert" className="rounded border border-neutral-200 bg-[#F5F5F5] p-4 text-sm text-neutral-700">{dateError || 'Reports could not be loaded. Confirm that the MSONJO operations migration is applied.'}</p>
      ) : (
        <>
          <section aria-label="Report summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Recorded sales', formatKes(jsonNumber(report.sales_total) ?? 0)],
              ['Number of sales', String(jsonNumber(report.sale_count) ?? 0)],
              ['Gross profit estimate', jsonNumber(report.gross_profit_estimate) === null ? 'Restricted' : formatKes(jsonNumber(report.gross_profit_estimate)!)],
              ['Inventory value at cost', jsonNumber(inventory?.stock_value_at_cost) === null ? 'Restricted' : formatKes(jsonNumber(inventory?.stock_value_at_cost)!)],
              ['Active products', String(jsonNumber(inventory?.product_count) ?? 0)],
              ['Stock units', String(jsonNumber(inventory?.stock_units) ?? 0)],
              ['Low stock', String(jsonNumber(inventory?.low_stock_count) ?? 0)],
              ['Out of stock', String(jsonNumber(inventory?.out_of_stock_count) ?? 0)],
            ].map(([label, value]) => <div key={label} className="rounded border border-neutral-200 p-4"><h2 className="text-sm text-neutral-700">{label}</h2><p className="mt-3 text-xl font-semibold">{value}</p></div>)}
          </section>
          <p className="mt-3 text-xs leading-5 text-neutral-600">Gross profit estimate uses each item’s cost price snapshot recorded at sale time. It is not net profit and excludes operating expenses, fees, and tax.</p>

          <section className="mt-6 rounded border border-neutral-200">
            <h2 className="border-b border-neutral-200 px-4 py-4 text-sm font-semibold">Daily sales</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[440px] text-left text-sm"><thead className="bg-[#F5F5F5] text-xs uppercase text-neutral-600"><tr><th className="px-4 py-3">Date (Nairobi)</th><th className="px-4 py-3">Sales</th><th className="px-4 py-3">Transactions</th></tr></thead>
                <tbody>{dailyRows.map((row) => <tr key={jsonString(row.day)} className="border-t border-neutral-200"><td className="px-4 py-3">{jsonString(row.day)}</td><td className="px-4 py-3">{formatKes(jsonNumber(row.total) ?? 0)}</td><td className="px-4 py-3">{jsonNumber(row.count) ?? 0}</td></tr>)}
                  {!dailyRows.length ? <tr><td colSpan={3} className="px-4 py-8 text-center text-neutral-600">No sales recorded for this period.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
          <section className="mt-6 rounded border border-neutral-200">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-4">
              <h2 className="text-sm font-semibold">Low-stock and out-of-stock products</h2>
              <Link href="/products?stock=low" className="text-sm text-[#E31E24] underline">Product list</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm"><thead className="bg-[#F5F5F5] text-xs uppercase text-neutral-600"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">On hand</th><th className="px-4 py-3">Threshold</th><th className="px-4 py-3">Status</th></tr></thead>
                <tbody>{lowStockRows.map((row) => <tr key={jsonString(row.id)} className="border-t border-neutral-200"><td className="px-4 py-3">{jsonString(row.name)}</td><td className="px-4 py-3">{jsonNumber(row.quantity) ?? 0}</td><td className="px-4 py-3">{jsonNumber(row.low_stock_threshold) ?? 0}</td><td className="px-4 py-3">{(jsonNumber(row.quantity) ?? 0) === 0 ? 'Out of stock' : 'Low stock'}</td></tr>)}
                  {!lowStockRows.length ? <tr><td colSpan={4} className="px-4 py-8 text-center text-neutral-600">No products need restocking.</td></tr> : null}
                </tbody>
              </table>
            </div>
            {lowStockRows.length === 100 ? <p className="px-4 py-2 text-xs text-neutral-600">Showing the first 100 products needing attention.</p> : null}
          </section>
          <section className="mt-6 rounded border border-neutral-200">
            <h2 className="border-b border-neutral-200 px-4 py-4 text-sm font-semibold">Sales by product</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-[#F5F5F5] text-xs uppercase text-neutral-600"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Units sold</th><th className="px-4 py-3">Recorded sales</th><th className="px-4 py-3">Gross profit estimate</th></tr></thead>
                <tbody>{productRows.map((row) => <tr key={jsonString(row.product_id)} className="border-t border-neutral-200"><td className="px-4 py-3">{jsonString(row.name)}</td><td className="px-4 py-3">{jsonNumber(row.quantity) ?? 0}</td><td className="px-4 py-3">{formatKes(jsonNumber(row.revenue) ?? 0)}</td><td className="px-4 py-3">{jsonNumber(row.gross_profit_estimate) === null ? 'Restricted' : formatKes(jsonNumber(row.gross_profit_estimate)!)}</td></tr>)}
                  {!productRows.length ? <tr><td colSpan={4} className="px-4 py-8 text-center text-neutral-600">No product sales recorded for this period.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
