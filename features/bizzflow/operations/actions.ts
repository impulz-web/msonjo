'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getActiveBusinessContext } from '@/lib/bizzflow/context';
import { jsonObject, parseProduct } from '@/lib/bizzflow/operations-data';

export type OperationFormState = {
  error?: string;
  success?: string;
  saleId?: string;
};

type SaleLineInput =
  | { kind: 'catalog'; product_id: string; quantity: number }
  | {
    kind: 'manual';
    name: string;
    quantity: number;
    unit_price: number;
    unit_cost: number | null;
  };

export type SaleProduct = {
  id: string;
  name: string;
  sku: string | null;
  quantity: number;
  selling_price: number;
  cost_price: number | null;
};

function read(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function amount(formData: FormData, name: string, allowZero = true) {
  const value = read(formData, name);
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && (allowZero ? parsed >= 0 : parsed > 0) ? value : null;
}

function wholeNumber(formData: FormData, name: string, minimum = 0, maximum = 2147483647) {
  const value = read(formData, name);
  if (!/^\d{1,10}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

export async function searchSaleProductsAction(query: string): Promise<{ products: SaleProduct[]; error?: string }> {
  const search = query.trim().slice(0, 100);
  if (!search) return { products: [] };

  const { supabase, business } = await getActiveBusinessContext();
  const { data, error } = await supabase.rpc('list_products', {
    p_business_id: business.id,
    p_search: search,
    p_category: null,
    p_stock_status: 'all',
    p_sort: 'name',
    p_limit: 50,
    p_offset: 0,
  });
  if (error) return { products: [], error: 'Products could not be searched. Try again.' };

  const response = jsonObject(data);
  const rows = response?.items;
  const products = Array.isArray(rows)
    ? rows.map((row) => parseProduct(row))
      .filter((row): row is NonNullable<ReturnType<typeof parseProduct>> => row !== null)
      .map(({ id, name, sku, quantity, selling_price, cost_price }) => ({
        id, name, sku, quantity, selling_price, cost_price,
      }))
    : [];
  return { products };
}

export async function createProductAction(
  _state: OperationFormState,
  formData: FormData,
): Promise<OperationFormState> {
  const name = read(formData, 'name');
  const sku = read(formData, 'sku');
  const category = read(formData, 'category');
  const costPrice = amount(formData, 'cost_price');
  const sellingPrice = amount(formData, 'selling_price');
  const threshold = wholeNumber(formData, 'low_stock_threshold');
  const initialQuantity = wholeNumber(formData, 'initial_quantity');
  const operationKey = read(formData, 'operation_key');

  if (name.length < 1 || name.length > 160 || sku.length > 100 || category.length > 100
    || costPrice === null || sellingPrice === null || threshold === null || initialQuantity === null
    || (initialQuantity > 0 && !/^[0-9a-f-]{36}$/i.test(operationKey))) {
    return { error: 'Check the product details, prices, and whole-number stock values.' };
  }

  const { supabase, business } = await getActiveBusinessContext();
  const { data, error } = await supabase.rpc('create_product', {
    p_business_id: business.id,
    p_name: name,
    p_sku: sku || null,
    p_category: category || null,
    p_cost_price: Number(costPrice),
    p_selling_price: Number(sellingPrice),
    p_low_stock_threshold: threshold,
    p_initial_quantity: initialQuantity,
    p_operation_key: initialQuantity ? operationKey : null,
  });

  if (error) {
    return { error: error?.code === '23505'
      ? 'That product code is already used by a product in this business.'
      : 'Product could not be saved. Check database setup and try again.' };
  }

  revalidatePath('/');
  revalidatePath('/products');
  redirect(`/products/${data}`);
}

export async function updateProductAction(
  productId: string,
  _state: OperationFormState,
  formData: FormData,
): Promise<OperationFormState> {
  const name = read(formData, 'name');
  const sku = read(formData, 'sku');
  const category = read(formData, 'category');
  const costPrice = amount(formData, 'cost_price');
  const sellingPrice = amount(formData, 'selling_price');
  const threshold = wholeNumber(formData, 'low_stock_threshold');

  if (!/^[0-9a-f-]{36}$/i.test(productId) || name.length < 1 || name.length > 160
    || sku.length > 100 || category.length > 100 || costPrice === null
    || sellingPrice === null || threshold === null) {
    return { error: 'Check the product details, prices, and stock threshold.' };
  }

  const { supabase, business } = await getActiveBusinessContext();
  const { data, error } = await supabase.from('products').update({
    name,
    sku: sku || null,
    category: category || null,
    cost_price: Number(costPrice),
    selling_price: Number(sellingPrice),
    low_stock_threshold: threshold,
  }).eq('business_id', business.id).eq('id', productId).select('id').maybeSingle();

  if (error || !data) {
    return { error: error?.code === '23505'
      ? 'That product code is already used by another product in this business.'
      : 'Product could not be updated. It may have been removed or is not available to this business.' };
  }

  revalidatePath('/');
  revalidatePath('/products');
  revalidatePath(`/products/${productId}`);
  return { success: 'Product details saved.' };
}

async function archiveProductFromActiveInventory(productId: string): Promise<boolean> {
  const { supabase, business } = await getActiveBusinessContext();
  const { data, error } = await supabase.from('products').update({ is_archived: true })
    .eq('business_id', business.id).eq('id', productId).select('id').maybeSingle();
  if (error || !data) return false;
  revalidatePath('/products');
  revalidatePath(`/products/${productId}`);
  return true;
}

export async function archiveProductAction(formData: FormData): Promise<void> {
  const productId = read(formData, 'product_id');
  if (!/^[0-9a-f-]{36}$/i.test(productId)) redirect('/products');
  if (!await archiveProductFromActiveInventory(productId)) redirect('/products?notice=archive-error');
  redirect('/products?notice=archived');
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  const productId = read(formData, 'product_id');
  if (!/^[0-9a-f-]{36}$/i.test(productId)) redirect('/products');
  if (!await archiveProductFromActiveInventory(productId)) redirect('/products?notice=archive-error');
  redirect('/products?notice=deleted');
}

export async function adjustStockAction(
  _state: OperationFormState,
  formData: FormData,
): Promise<OperationFormState> {
  const productId = read(formData, 'product_id');
  const movementType = read(formData, 'movement_type');
  const changeText = read(formData, 'quantity_change');
  const reason = read(formData, 'reason');
  const operationKey = read(formData, 'operation_key');
  const change = /^-?\d{1,10}$/.test(changeText) ? Number(changeText) : NaN;
  const supportedTypes = new Set(['restock', 'adjustment', 'damaged', 'lost', 'correction']);

  if (!/^[0-9a-f-]{36}$/i.test(productId) || !Number.isInteger(change) || change === 0
    || Math.abs(change) > 2147483647 || !supportedTypes.has(movementType) || reason.length > 500
    || (movementType === 'restock' && change < 0)
    || (['damaged', 'lost'].includes(movementType) && change > 0)
    || !/^[0-9a-f-]{36}$/i.test(operationKey)) {
    return { error: 'Enter a valid movement type and non-zero signed quantity.' };
  }

  const { supabase, business } = await getActiveBusinessContext();
  const { error } = await supabase.rpc('adjust_stock', {
    p_business_id: business.id,
    p_product_id: productId,
    p_quantity_change: change,
    p_movement_type: movementType,
    p_reason: reason || null,
    p_operation_key: operationKey,
  });

  if (error) {
    return { error: error.message.includes('below zero')
      ? 'This change would take stock below zero.'
      : 'Stock could not be updated. Check the product and try again.' };
  }

  revalidatePath('/');
  revalidatePath('/products');
  revalidatePath(`/products/${productId}`);
  return { success: 'Stock updated and movement recorded.' };
}

export async function createSaleAction(
  _state: OperationFormState,
  formData: FormData,
): Promise<OperationFormState> {
  const paymentMethod = read(formData, 'payment_method');
  const paymentStatus = read(formData, 'payment_status');
  const amountPaid = amount(formData, 'amount_paid');
  const customerName = read(formData, 'customer_name');
  const customerPhone = read(formData, 'customer_phone');
  const rawItems = read(formData, 'items');
  const idempotencyKey = read(formData, 'idempotency_key');
  if (!['cash', 'mpesa', 'other'].includes(paymentMethod)) {
    return { error: 'Choose a supported payment method.' };
  }
  if (!['paid', 'partial', 'credit'].includes(paymentStatus) || amountPaid === null) {
    return { error: 'Choose a valid payment status and amount received.' };
  }
  if (paymentStatus === 'partial' && Number(amountPaid) <= 0) {
    return { error: 'Enter the amount received for a partial payment.' };
  }
  if (paymentStatus === 'credit' && Number(amountPaid) !== 0) {
    return { error: 'A credit sale must start with no payment received.' };
  }
  if (paymentStatus !== 'paid'
    && (customerName.length < 1 || customerName.length > 120
      || customerPhone.length < 5 || customerPhone.length > 32)) {
    return { error: 'Enter the customer name and phone for a sale with a balance due.' };
  }
  if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
    return { error: 'Refresh the page and try again.' };
  }

  const { supabase, business } = await getActiveBusinessContext();
  const items = parseSaleItems(rawItems, true);
  if (!items) return { error: 'Check product names, quantities, and selling prices.' };

  const { data, error } = await supabase.rpc('record_sale_with_payment', {
    p_business_id: business.id,
    p_idempotency_key: idempotencyKey,
    p_payment_method: paymentMethod,
    p_payment_status: paymentStatus,
    p_items: items,
    p_amount_paid: Number(amountPaid),
    p_customer_name: paymentStatus === 'paid' ? null : customerName,
    p_customer_phone: paymentStatus === 'paid' ? null : customerPhone,
  });

  if (error || !data) {
    if (error?.message.includes('Insufficient stock')) {
      return { error: 'There is not enough stock for one or more cart items.' };
    }
    if (error?.message.includes('Amount paid cannot exceed')) {
      return { error: 'The amount received cannot exceed the sale total.' };
    }
    return { error: 'Sale was not recorded. Check the details and try again.' };
  }

  revalidatePath('/');
  revalidatePath('/dashboard');
  revalidatePath('/products');
  revalidatePath('/sales');
  revalidatePath('/reports');
  return { success: 'Sale recorded.', saleId: data };
}

function parseSaleItems(rawItems: string, canViewCosts: boolean): SaleLineInput[] | null {
  let items: unknown;
  try {
    items = JSON.parse(rawItems);
  } catch {
    return null;
  }
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) {
    return null;
  }
  const parsed: SaleLineInput[] = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null || !('kind' in item)
      || !('quantity' in item) || !Number.isInteger(item.quantity)
      || item.quantity < 1 || item.quantity > 1000000) {
      return null;
    }
    if (item.kind === 'catalog') {
      if (!('product_id' in item) || typeof item.product_id !== 'string'
        || !/^[0-9a-f-]{36}$/i.test(item.product_id)) return null;
      parsed.push({ kind: 'catalog', product_id: item.product_id, quantity: item.quantity });
      continue;
    }
    if (item.kind === 'manual') {
      if (!('name' in item) || typeof item.name !== 'string'
        || item.name.trim().length < 1 || item.name.trim().length > 160
        || !('unit_price' in item)
        || typeof item.unit_price !== 'number'
        || !Number.isFinite(item.unit_price) || item.unit_price < 0 || item.unit_price > 9999999999.99
        || !('unit_cost' in item)
        || (item.unit_cost !== null
          && (typeof item.unit_cost !== 'number' || !Number.isFinite(item.unit_cost)
            || item.unit_cost < 0 || item.unit_cost > 9999999999.99))) return null;
      parsed.push({
        kind: 'manual',
        name: item.name.trim(),
        quantity: item.quantity,
        unit_price: item.unit_price,
        unit_cost: canViewCosts ? item.unit_cost : null,
      });
      continue;
    }
    return null;
  }
  return parsed;
}

export async function editSaleAction(
  saleId: string,
  _state: OperationFormState,
  formData: FormData,
): Promise<OperationFormState> {
  const paymentMethod = read(formData, 'payment_method');
  const amountPaid = amount(formData, 'amount_paid');
  const customerName = read(formData, 'customer_name');
  const customerPhone = read(formData, 'customer_phone');
  const idempotencyKey = read(formData, 'idempotency_key');
  if (!/^[0-9a-f-]{36}$/i.test(saleId)
    || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)
    || !['cash', 'mpesa', 'other'].includes(paymentMethod)
    || amountPaid === null) {
    return { error: 'Check the sale details and try again.' };
  }
  if ((customerName && customerName.length > 120)
    || (customerPhone && customerPhone.length > 32)
    || ((customerName.length > 0) !== (customerPhone.length > 0))) {
    return { error: 'Enter both a valid customer name and phone, or leave both blank.' };
  }

  const { supabase, business } = await getActiveBusinessContext();
  const items = parseSaleItems(read(formData, 'items'), true);
  if (!items) return { error: 'Check product names, quantities, and selling prices.' };
  const { data, error } = await supabase.rpc('edit_sale_with_lines', {
    p_business_id: business.id,
    p_sale_id: saleId,
    p_idempotency_key: idempotencyKey,
    p_payment_method: paymentMethod,
    p_items: items,
    p_amount_paid: Number(amountPaid),
    p_customer_name: customerName || null,
    p_customer_phone: customerPhone || null,
  });

  if (error || !data) {
    if (error?.message.includes('Insufficient stock')) {
      return { error: 'The updated quantities exceed available stock.' };
    }
    if (error?.message.includes('Recorded payments cannot be reduced')) {
      return { error: 'Previously recorded payments cannot be reduced.' };
    }
    if (error?.message.includes('Amount paid cannot exceed')) {
      return { error: 'The total received cannot exceed the updated sale total.' };
    }
    if (error?.message.includes('Customer name and phone are required')) {
      return { error: 'Enter the customer name and phone while a balance remains.' };
    }
    if (error?.message.includes('Archived products')) {
      return { error: 'Archived products cannot be added to a sale.' };
    }
    if (error?.message.includes('Sale predates payment tracking')) {
      return { error: 'This older sale cannot be edited safely.' };
    }
    return { error: 'Sale could not be updated. Check the details and try again.' };
  }

  revalidatePath('/');
  revalidatePath('/dashboard');
  revalidatePath('/products');
  revalidatePath('/sales');
  revalidatePath(`/sales/${saleId}`);
  revalidatePath('/reports');
  return { success: 'Sale updated.', saleId };
}
