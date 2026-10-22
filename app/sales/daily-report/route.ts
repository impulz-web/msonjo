import { NextResponse } from 'next/server';
import { getActiveBusinessContext } from '@/lib/bizzflow/context';
import { jsonNumber, jsonObject, jsonString } from '@/lib/bizzflow/operations-data';

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

function safeText(value: string) {
  return value.normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replace(/([\\()])/g, '\\$1');
}

function kes(value: number) {
  return `KES ${new Intl.NumberFormat('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

function textCommand(value: string, x: number, y: number, size = 9, color = '0 0 0') {
  return `BT /F1 ${size} Tf ${color} rg ${x} ${y} Td (${safeText(value)}) Tj ET\n`;
}

function makePdf(pages: string[]) {
  const pageIds = pages.map((_, index) => 3 + index * 2);
  const fontId = 3 + pages.length * 2;
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  ];

  pages.forEach((content, index) => {
    const pageId = 3 + index * 2;
    const streamId = pageId + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${streamId} 0 R >>`,
      `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}endstream`,
    );
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let document = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(document, 'ascii'));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(document, 'ascii');
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    document += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(document, 'ascii');
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
  const pages: string[] = [];
  let content = '';
  let y = 0;

  const startPage = (continued: boolean) => {
    content = '';
    content += textCommand(businessName, 40, 802, 17, '0 0 0');
    content += textCommand('DAILY SALES REPORT', 40, 778, 10, '0.06 0.46 0.43');
    content += textCommand(`${dayName}${continued ? ' (continued)' : ''}`, 40, 759, 9, '0.25 0.25 0.25');
    if (!continued) {
      content += textCommand(`Sales: ${sales.length}   Total: ${kes(total)}   Paid: ${kes(paid)}   Due: ${kes(outstanding)}`, 40, 735, 9, '0 0 0');
    }
    content += '0.06 0.46 0.43 RG 40 722 m 555 722 l S\n';
    content += textCommand('Time', 40, 704, 8, '0.25 0.25 0.25');
    content += textCommand('Sale', 91, 704, 8, '0.25 0.25 0.25');
    content += textCommand('Customer', 144, 704, 8, '0.25 0.25 0.25');
    content += textCommand('Payment', 252, 704, 8, '0.25 0.25 0.25');
    content += textCommand('Total', 323, 704, 8, '0.25 0.25 0.25');
    content += textCommand('Paid', 398, 704, 8, '0.25 0.25 0.25');
    content += textCommand('Due', 472, 704, 8, '0.25 0.25 0.25');
    content += '0.8 0.8 0.8 RG 40 696 m 555 696 l S\n';
    y = 680;
  };

  startPage(false);
  for (const sale of sales) {
    if (y < 55) {
      content += textCommand('Powered by HWS', 40, 28, 8, '0.25 0.25 0.25');
      pages.push(content);
      startPage(true);
    }
    const time = new Intl.DateTimeFormat('en-KE', {
      timeStyle: 'short',
      timeZone: 'Africa/Nairobi',
    }).format(new Date(sale.created_at));
    const customer = sale.customer_name === '—'
      ? '—'
      : `${sale.customer_name} ${sale.customer_phone}`.slice(0, 19);
    const status = sale.balance_due <= 0 ? 'Paid' : sale.amount_paid > 0 ? 'Part paid' : 'Credit';
    content += textCommand(time, 40, y, 8);
    content += textCommand(sale.id.slice(0, 8), 91, y, 8);
    content += textCommand(customer, 144, y, 8);
    content += textCommand(`${status} / ${sale.payment_method}`.slice(0, 19), 252, y, 7);
    content += textCommand(kes(sale.total_amount), 323, y, 8);
    content += textCommand(kes(sale.amount_paid), 398, y, 8);
    content += textCommand(kes(sale.balance_due), 472, y, 8);
    content += '0.88 0.88 0.88 RG 40 ';
    content += `${y - 6} m 555 ${y - 6} l S\n`;
    y -= 19;
  }
  if (!sales.length) {
    content += textCommand('No sales recorded for this day.', 40, y, 9, '0.3 0.3 0.3');
  }
  content += textCommand('Powered by HWS', 40, 28, 8, '0.25 0.25 0.25');
  pages.push(content);
  return makePdf(pages);
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
