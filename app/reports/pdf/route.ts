import { NextResponse } from 'next/server';
import { getActiveBusinessContext } from '@/lib/bizzflow/context';
import { addCalendarDays, jsonNumber, jsonObject, jsonString } from '@/lib/bizzflow/operations-data';
import { createBrandedPdf } from '@/lib/bizzflow/pdf';

export const runtime = 'nodejs';

function isValidDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function kes(value: number) {
  return `KES ${new Intl.NumberFormat('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const from = params.get('from');
  const to = params.get('to');
  if (!isValidDate(from) || !isValidDate(to)
    || to < from
    || (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000 >= 366) {
    return NextResponse.json({ error: 'Choose a valid date range of no more than 366 days.' }, { status: 400 });
  }

  const { supabase, business } = await getActiveBusinessContext();
  const { data, error } = await supabase.rpc('get_business_reports', {
    p_business_id: business.id,
    p_start_date: from,
    p_end_date: addCalendarDays(to, 1),
  });
  if (error) {
    return NextResponse.json({ error: 'The report PDF could not be generated.' }, { status: 503 });
  }

  const report = jsonObject(data);
  if (!report) {
    return NextResponse.json({ error: 'The report PDF could not be generated.' }, { status: 503 });
  }
  const inventory = jsonObject(report.inventory);
  const days = Array.isArray(report.sales_by_day)
    ? report.sales_by_day.map((entry) => jsonObject(entry)).filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    : [];
  const products = Array.isArray(report.sales_by_product)
    ? report.sales_by_product.map((entry) => jsonObject(entry)).filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    : [];
  const lines = [
    `Period: ${from} to ${to} (inclusive, Africa/Nairobi)`,
    '',
    'PERIOD SUMMARY',
    `Recorded sales: ${kes(jsonNumber(report.sales_total) ?? 0)}`,
    `Number of sales: ${jsonNumber(report.sale_count) ?? 0}`,
    `Gross profit estimate: ${jsonNumber(report.gross_profit_estimate) === null ? 'Restricted' : kes(jsonNumber(report.gross_profit_estimate)!)}`,
    '',
    'INVENTORY SUMMARY',
    `Active products: ${jsonNumber(inventory?.product_count) ?? 0}`,
    `Stock units: ${jsonNumber(inventory?.stock_units) ?? 0}`,
    `Inventory value at cost: ${jsonNumber(inventory?.stock_value_at_cost) === null ? 'Restricted' : kes(jsonNumber(inventory?.stock_value_at_cost)!)}`,
    `Low stock: ${jsonNumber(inventory?.low_stock_count) ?? 0}  |  Out of stock: ${jsonNumber(inventory?.out_of_stock_count) ?? 0}`,
    '',
    'DAILY SALES',
    ...days.map((day) => (
      `${jsonString(day.day) ?? 'Date not available'}  |  ${jsonNumber(day.count) ?? 0} transactions  |  ${kes(jsonNumber(day.total) ?? 0)}`
    )),
    ...(!days.length ? ['No sales recorded for this period.'] : []),
    '',
    'SALES BY PRODUCT',
    ...products.map((product) => (
      `${(jsonString(product.name) ?? 'Product').slice(0, 32)}  |  ${jsonNumber(product.quantity) ?? 0} units  |  Revenue ${kes(jsonNumber(product.revenue) ?? 0)}  |  Gross profit ${jsonNumber(product.gross_profit_estimate) === null ? 'Restricted' : kes(jsonNumber(product.gross_profit_estimate)!)}`
    )),
    ...(!products.length ? ['No product sales recorded for this period.'] : []),
  ];
  const pdf = createBrandedPdf(
    business.name,
    'Sales & Inventory Report',
    `${from} to ${to} inclusive`,
    lines,
  );
  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="msonjo-report-${from}-to-${to}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
