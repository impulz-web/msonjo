import Link from 'next/link';
import InventoryPageHeader from '../shared/InventoryPageHeader';
import MonthSalesFilter from './MonthSalesFilter';
import { getActiveBusinessContext } from '@/lib/bizzflow/context';
import { formatKes, getNairobiDate, jsonNumber, jsonObject, jsonString } from '@/lib/bizzflow/operations-data';

type SaleSearchParams = { month?: string };

function validMonth(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return false;
  const monthNumber = Number(value.slice(5));
  return monthNumber >= 1 && monthNumber <= 12;
}

function paymentStatus(paid: number, total: number) {
  if (paid <= 0) return 'Credit';
  if (paid < total) return 'Part paid';
  return 'Paid';
}

export default async function SalesPage({ searchParams }: { searchParams: SaleSearchParams }) {
  const today = getNairobiDate();
  const selectedMonth = validMonth(searchParams.month) ? searchParams.month! : today.slice(0, 7);
  const [year, month] = selectedMonth.split('-').map(Number);
  const startDate = `${selectedMonth}-01`;
  const endDate = `${selectedMonth}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
  const { supabase, business } = await getActiveBusinessContext();
  const { data, error } = await supabase.rpc('get_daily_sales', {
    p_business_id: business.id,
    p_start_date: startDate,
    p_end_date: endDate,
  });
  const days = !error && Array.isArray(data)
    ? data.map((entry) => jsonObject(entry)).filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    : [];
  const sales: Array<{
    sale: NonNullable<ReturnType<typeof jsonObject>>;
    saleDate: string;
  }> = days.flatMap((day) => {
    const date = jsonString(day.date);
    if (!date || !Array.isArray(day.sales)) return [];
    return day.sales
      .map((entry) => jsonObject(entry))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .map((sale) => ({ sale, saleDate: date }));
  }).sort((left, right) => (
    (jsonString(right.sale.created_at) ?? '').localeCompare(jsonString(left.sale.created_at) ?? '')
  ));
  const saleIds = sales
    .map(({ sale }) => jsonString(sale.id))
    .filter((saleId): saleId is string => saleId !== null);
  const { data: saleItems, error: saleItemsError } = saleIds.length
    ? await supabase
      .from('sale_items')
      .select('sale_id, product_id, quantity')
      .eq('business_id', business.id)
      .in('sale_id', saleIds)
    : { data: [], error: null };
  const productIds = [...new Set((saleItems ?? []).map(({ product_id }) => product_id))];
  const { data: products, error: productsError } = productIds.length
    ? await supabase
      .from('products')
      .select('id, name')
      .eq('business_id', business.id)
      .in('id', productIds)
    : { data: [], error: null };
  const productNames = new Map((products ?? []).map(({ id, name }) => [id, name]));
  const productNamesBySale = new Map<string, string[]>();
  for (const item of saleItems ?? []) {
    const name = productNames.get(item.product_id);
    if (!name) continue;
    const saleProductNames = productNamesBySale.get(item.sale_id) ?? [];
    saleProductNames.push(`${name} × ${item.quantity}`);
    productNamesBySale.set(item.sale_id, saleProductNames);
  }
  const productNamesError = saleItemsError ?? productsError;
  const monthlySales = days.reduce((sum, day) => sum + (jsonNumber(day.sales_total) ?? 0), 0);
  const monthlyPaid = days.reduce((sum, day) => sum + (jsonNumber(day.paid_total) ?? 0), 0);
  const monthlyBalance = days.reduce((sum, day) => sum + (jsonNumber(day.balance_due) ?? 0), 0);

  return (
    <>
      <InventoryPageHeader
        title="Sales"
        description={`Sales and payments for ${business.name}.`}
        action={{ label: 'Add sale', href: '/sales/new' }}
      />
      <MonthSalesFilter month={selectedMonth} />
      <form action="/sales/daily-report" method="get" className="mb-5 flex flex-wrap items-end gap-3 rounded border border-neutral-200 p-3">
        <div>
          <label htmlFor="sales-report-date" className="mb-1 block text-xs font-medium">Daily sales PDF</label>
          <input
            id="sales-report-date"
            name="date"
            type="date"
            defaultValue={today}
            required
            className="min-h-10 rounded border border-neutral-300 px-2 text-sm"
          />
        </div>
        <button className="min-h-10 rounded bg-[#E31E24] px-4 text-sm font-medium !text-white hover:!text-white">
          Download daily PDF
        </button>
      </form>

      {error ? (
        <p role="alert" className="rounded border border-neutral-200 bg-[#F5F5F5] p-4 text-sm text-neutral-700">
          Sales could not be loaded. Confirm that the latest MSONJO sales migration is applied.
        </p>
      ) : (
        <>
          {productNamesError ? (
            <p role="alert" className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              Product names could not be loaded for sales. Check database access and refresh the page.
            </p>
          ) : null}
          <section aria-label="Monthly totals" className="mb-5 grid gap-3 sm:grid-cols-3">
            {[
              ['Total sales', monthlySales],
              ['Payments received', monthlyPaid],
              ['Outstanding', monthlyBalance],
            ].map(([label, value]) => (
              <div key={label} className="rounded border border-neutral-200 p-4">
                <h2 className="text-xs font-medium text-neutral-600">{label}</h2>
                <p className="mt-2 text-lg font-semibold">{formatKes(Number(value))}</p>
              </div>
            ))}
          </section>

          <section aria-label="Sales list" className="overflow-hidden rounded border border-neutral-200">
            <h2 className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold">Sales</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-left text-xs sm:text-sm">
                <thead className="bg-[#F5F5F5] text-[11px] uppercase text-neutral-600">
                  <tr>
                    <th className="px-3 py-2">Date / time</th>
                    <th className="px-3 py-2">Sale</th>
                    <th className="px-3 py-2">Products</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Payment</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Paid</th>
                    <th className="px-3 py-2 text-right">Remaining</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => {
                    const id = jsonString(sale.sale.id);
                    const total = jsonNumber(sale.sale.total_amount) ?? 0;
                    const paid = jsonNumber(sale.sale.amount_paid) ?? 0;
                    const createdAt = jsonString(sale.sale.created_at);
                    const saleProductNames = id ? productNamesBySale.get(id) ?? [] : [];
                    return (
                      <tr key={id} className="border-t border-neutral-200">
                        <td className="whitespace-nowrap px-3 py-2">
                          {createdAt
                            ? new Intl.DateTimeFormat('en-KE', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                              timeZone: 'Africa/Nairobi',
                            }).format(new Date(createdAt))
                            : sale.saleDate}
                        </td>
                        <td className="px-3 py-2">
                          <Link href={`/sales/${id}`} className="font-medium text-[#E31E24] underline">
                            {id?.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="max-w-64 px-3 py-2">
                          {productNamesError
                            ? 'Unavailable'
                            : saleProductNames.length
                              ? saleProductNames.join(', ')
                              : 'No product items'}
                        </td>
                        <td className="px-3 py-2">
                          {jsonString(sale.sale.customer_name)
                            ? `${jsonString(sale.sale.customer_name)} · ${jsonString(sale.sale.customer_phone) ?? ''}`
                            : '—'}
                        </td>
                        <td className="px-3 py-2">{jsonString(sale.sale.payment_method) ?? '—'}</td>
                        <td className="px-3 py-2">{paymentStatus(paid, total)}</td>
                        <td className="px-3 py-2 text-right">{formatKes(paid)}</td>
                        <td className="px-3 py-2 text-right">{formatKes(Math.max(0, total - paid))}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatKes(total)}</td>
                        <td className="px-3 py-2">
                          <Link href={`/sales/${id}/edit`} className="text-[#E31E24] underline">Edit</Link>
                        </td>
                      </tr>
                    );
                  })}
                  {!sales.length ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-neutral-600">
                        Sales not available for this month.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap justify-end gap-x-6 gap-y-2 border-t border-neutral-200 bg-[#F5F5F5] px-4 py-4 text-sm font-semibold">
              <span>Month total {formatKes(monthlySales)}</span>
              <span>Paid {formatKes(monthlyPaid)}</span>
              <span>Due {formatKes(monthlyBalance)}</span>
            </div>
          </section>
        </>
      )}
    </>
  );
}
