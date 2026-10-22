import type { Json } from '@/lib/database.types';

export type ProductRow = {
  id: string;
  business_id: string;
  name: string;
  sku: string | null;
  category: string | null;
  cost_price: number | null;
  selling_price: number;
  quantity: number;
  low_stock_threshold: number;
  is_archived: boolean;
  created_at: string;
};

export function jsonObject(value: Json | undefined): Record<string, Json | undefined> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export function jsonString(value: Json | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

export function jsonNumber(value: Json | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

export function parseProduct(value: Json | undefined): ProductRow | null {
  const row = jsonObject(value);
  if (!row) return null;
  const id = jsonString(row.id);
  const businessId = jsonString(row.business_id);
  const name = jsonString(row.name);
  const createdAt = jsonString(row.created_at);
  const costPrice = jsonNumber(row.cost_price);
  const sellingPrice = jsonNumber(row.selling_price);
  const quantity = jsonNumber(row.quantity);
  const threshold = jsonNumber(row.low_stock_threshold);
  if (!id || !businessId || !name || !createdAt
    || sellingPrice === null || quantity === null || threshold === null) return null;

  return {
    id,
    business_id: businessId,
    name,
    sku: jsonString(row.sku),
    category: jsonString(row.category),
    cost_price: costPrice,
    selling_price: sellingPrice,
    quantity,
    low_stock_threshold: threshold,
    is_archived: row.is_archived === true,
    created_at: createdAt,
  };
}

export function getNairobiDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function addCalendarDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatKes(value: number) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 2,
  }).format(value);
}
