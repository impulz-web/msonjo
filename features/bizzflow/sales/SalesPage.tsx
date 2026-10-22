import Link from 'next/link';
import InventoryPageHeader from '../shared/InventoryPageHeader';
import { getActiveBusinessContext } from '@/lib/bizzflow/context';
import { formatKes, getNairobiDate, jsonNumber, jsonObject, jsonString } from '@/lib/bizzflow/operations-data';

type SaleSearchParams = { month?: string };

function validMonth(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return false;
  const monthNumber = Number(value.slice(5));
  return monthNumber >= 1 && monthNumber <= 12;
}

function dayLabel(value: string) {
  const date = new Date(`${value}T12:00:00+03:00`);
  return new Intl.DateTimeFormat('en-KE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Nairobi',
  }).format(date);
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
  const { supabase, business, user } = await getActiveBusinessContext();
  const { data, error } = await supabase.rpc('get_daily_sales', {
    p_business_id: business.id,
    p_start_date: startDate,
    p_end_date: endDate,
  });
  const days = !error && Array.isArray(data)
    ? data.map((entry) => jsonObject(entry)).filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    : [];
  const monthlySales = days.reduce((sum, day) => sum + (jsonNumber(day.sales_total) ?? 0), 0);
  const monthlyPaid = days.reduce((sum, day) => sum + (jsonNumber(day.paid_total) ?? 0), 0);
  const monthlyBalance = days.reduce((sum, day) => sum + (jsonNumber(day.balance_due) ?? 0), 0);

  return (
    <>
      <InventoryPageHeader
        title="Sales"
        description={`Daily sales and payments for ${business.name}.`}
        action={{ label: 'Add sale', href: '/sales/new' }}
      />
      <form method="get" className="mb-5 flex flex-wrap items-end gap-3 rounded border border-neutral-200 p-3">
        <div>
          <label htmlFor="month" className="mb-1 block text-xs font-medium">Choose month</label>
          <input id="month" name="month" type="month" value={selectedMonth} className="min-h-10 rounded border border-neutral-300 px-2 text-sm" />
        </div>
        <button className="min-h-10 rounded bg-[#E31E24] px-4 text-sm font-medium !text-white hover:!text-white">View days</button>
      </form>

      {error ? (
        <p role="alert" className="rounded border border-neutral-200 bg-[#F5F5F5] p-4 text-sm text-neutral-700">
          Daily sales could not be loaded. Confirm that the latest MSONJO sales migration is applied.
        </p>
      ) : (
        <>
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

          <section aria-label="Daily sales" className="overflow-hidden rounded border border-neutral-200">
            <h2 className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold">Daily sales</h2>
            <div className="divide-y divide-neutral-200">
              {days.map((day) => {
                const date = jsonString(day.date);
                if (!date) return null;
                const sales = Array.isArray(day.sales)
                  ? day.sales.map((entry) => jsonObject(entry)).filter((entry): entry is NonNullable<typeof entry> => entry !== null)
                  : [];
                const count = jsonNumber(day.sales_count) ?? 0;

                return (
                  <details key={date} className="group">
                    <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-[#F5F5F5] [&::-webkit-details-marker]:hidden">
                      <span className="font-medium">{dayLabel(date)}</span>
                      <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-700 sm:text-sm">
                        <span>{count} {count === 1 ? 'sale' : 'sales'}</span>
                        <span>Total {formatKes(jsonNumber(day.sales_total) ?? 0)}</span>
                        <span className="text-[#E31E24]">Details +</span>
                      </span>
                    </summary>
                    <div className="border-t border-neutral-200 bg-[#F5F5F5] p-3 sm:p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-neutral-700">
                          Paid {formatKes(jsonNumber(day.paid_total) ?? 0)} · Due {formatKes(jsonNumber(day.balance_due) ?? 0)}
                        </p>
                        <a
                          href={`/sales/daily-report?date=${date}`}
                          className="inline-flex min-h-9 items-center rounded border border-neutral-300 bg-white px-3 text-xs font-medium text-[#E31E24] no-underline hover:bg-[#F5F5F5]"
                        >
                          Download daily PDF
                        </a>
                      </div>
                      {sales.length ? (
                        <div className="overflow-x-auto rounded border border-neutral-200 bg-white">
                          <table className="w-full min-w-[720px] border-collapse text-left text-xs sm:text-sm">
                            <thead className="bg-white text-[11px] uppercase text-neutral-600">
                              <tr>
                                <th className="px-3 py-2">Time / sale</th>
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
                                const id = jsonString(sale.id);
                                const total = jsonNumber(sale.total_amount) ?? 0;
                                const paid = jsonNumber(sale.amount_paid) ?? 0;
                                const createdAt = jsonString(sale.created_at);
                                const createdBy = jsonString(sale.created_by);
                                const canEdit = business.role !== 'attendant' || createdBy === user.id;
                                return (
                                  <tr key={id} className="border-t border-neutral-200">
                                    <td className="px-3 py-2">
                                      <Link href={`/sales/${id}`} className="font-medium text-[#E31E24] underline">{createdAt ? new Intl.DateTimeFormat('en-KE', { timeStyle: 'short', timeZone: 'Africa/Nairobi' }).format(new Date(createdAt)) : 'Sale'} · {id?.slice(0, 8)}</Link>
                                    </td>
                                    <td className="px-3 py-2">{jsonString(sale.customer_name) ? `${jsonString(sale.customer_name)} · ${jsonString(sale.customer_phone) ?? ''}` : '—'}</td>
                                    <td className="px-3 py-2">{jsonString(sale.payment_method) ?? '—'}</td>
                                    <td className="px-3 py-2">{paymentStatus(paid, total)}</td>
                                    <td className="px-3 py-2 text-right">{formatKes(paid)}</td>
                                    <td className="px-3 py-2 text-right">{formatKes(Math.max(0, total - paid))}</td>
                                    <td className="px-3 py-2 text-right font-medium">{formatKes(total)}</td>
                                    <td className="px-3 py-2">{canEdit ? <Link href={`/sales/${id}/edit`} className="text-[#E31E24] underline">Edit</Link> : '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-neutral-200 font-semibold">
                                <th colSpan={4} className="px-3 py-3 text-right">Day total</th>
                                <td className="px-3 py-3 text-right">{formatKes(jsonNumber(day.paid_total) ?? 0)}</td>
                                <td className="px-3 py-3 text-right">{formatKes(jsonNumber(day.balance_due) ?? 0)}</td>
                                <td className="px-3 py-3 text-right">{formatKes(jsonNumber(day.sales_total) ?? 0)}</td>
                                <td />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      ) : (
                        <p className="rounded border border-neutral-200 bg-white px-3 py-5 text-center text-sm text-neutral-600">
                          No sales recorded on this day.
                        </p>
                      )}
                    </div>
                  </details>
                );
              })}
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
