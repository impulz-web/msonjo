import { NextResponse } from 'next/server';
import { getActiveBusinessContext } from '@/lib/bizzflow/context';
import { jsonNumber, jsonObject, jsonString } from '@/lib/bizzflow/operations-data';
import { createBrandedPdf } from '@/lib/bizzflow/pdf';

export const runtime = 'nodejs';

type PdfSale = {
  id: string;
  created_at: string;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  payment_method: string;
  customer_name: string;
  customer_phone: string;
};

function kes(value: number) {
  return `KES ${new Intl.NumberFormat('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

function saleRows(value: unknown): PdfSale[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const sale = jsonObject(entry);
    const id = jsonString(sale?.id);
    const createdAt = jsonString(sale?.created_at);
    const total = jsonNumber(sale?.total_amount);
    if (!id || !createdAt || total === null) return [];
    return [{
      id,
      created_at: createdAt,
      total_amount: total,
      amount_paid: jsonNumber(sale?.amount_paid) ?? 0,
      balance_due: jsonNumber(sale?.balance_due) ?? 0,
      payment_method: jsonString(sale?.payment_method) ?? 'Not recorded',
      customer_name: jsonString(sale?.customer_name) ?? '—',
      customer_phone: jsonString(sale?.customer_phone) ?? '',
    }];
  });
}

function buildDailyReportPdf(businessName: string, date: string, sales: PdfSale[]) {
  const total = sales.reduce((sum, sale) => sum + sale.total_amount, 0);
  const paid = sales.reduce((sum, sale) => sum + sale.amount_paid, 0);
  const outstanding = sales.reduce((sum, sale) => sum + sale.balance_due, 0);
  const dayName = new Intl.DateTimeFormat('en-KE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Nairobi',
  }).format(new Date(`${date}T12:00:00+03:00`));
  const lines = [
    `Transactions: ${sales.length}  |  Total: ${kes(total)}  |  Paid: ${kes(paid)}  |  Due: ${kes(outstanding)}`,
    '',
    'SALES DETAILS',
    ...sales.flatMap((sale) => {
      const time = new Intl.DateTimeFormat('en-KE', {
        timeStyle: 'short',
        timeZone: 'Africa/Nairobi',
      }).format(new Date(sale.created_at));
      const customer = sale.customer_name === '—'
        ? 'Walk-in customer'
        : `${sale.customer_name} ${sale.customer_phone}`.trim();
      return [
        `${time}  |  Sale ${sale.id.slice(0, 8)}  |  ${customer.slice(0, 45)}  |  ${sale.payment_method.slice(0, 16)}`,
        `    Total ${kes(sale.total_amount)}  |  Paid ${kes(sale.amount_paid)}  |  Due ${kes(sale.balance_due)}`,
      ];
    }),
    ...(!sales.length ? ['No sales recorded for this day.'] : []),
  ];
  return createBrandedPdf(businessName, 'Daily Sales Report', dayName, lines);
}

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get('date') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)
    || Number.isNaN(Date.parse(`${date}T12:00:00Z`))
    || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) {
    return NextResponse.json({ error: 'Choose a valid report date.' }, { status: 400 });
  }

  const { supabase, business } = await getActiveBusinessContext();
  const { data, error } = await supabase.rpc('get_daily_sales', {
    p_business_id: business.id,
    p_start_date: date,
    p_end_date: date,
  });
  if (error) {
    return NextResponse.json({ error: 'Daily sales report could not be generated.' }, { status: 503 });
  }

  const day = Array.isArray(data) ? jsonObject(data[0]) : null;
  const pdf = buildDailyReportPdf(business.name, date, saleRows(day?.sales));
  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="msonjo-sales-${date}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
