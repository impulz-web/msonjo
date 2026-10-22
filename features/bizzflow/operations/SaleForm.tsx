'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import {
  createSaleAction,
  editSaleAction,
  searchSaleProductsAction,
  type OperationFormState,
  type SaleProduct,
} from './actions';

export type SaleFormItem =
  | { kind: 'catalog'; product: SaleProduct; quantity: number }
  | {
    kind: 'manual';
    lineId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    unitCost: number | null;
  };
type CartItem = SaleFormItem;
type PaymentStatus = 'paid' | 'partial' | 'credit';

const money = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' });
const inputClass = 'min-h-10 rounded border border-neutral-300 px-2 text-sm';

export default function SaleForm({
  initialIdempotencyKey,
  saleId,
  initialItems = [],
  initialAmountPaid = 0,
  initialCustomerName = '',
  initialCustomerPhone = '',
  initialPaymentMethod = 'cash',
  canViewCosts = false,
}: {
  initialIdempotencyKey: string;
  saleId?: string;
  initialItems?: SaleFormItem[];
  initialAmountPaid?: number;
  initialCustomerName?: string;
  initialCustomerPhone?: string;
  initialPaymentMethod?: string;
  canViewCosts?: boolean;
}) {
  const action = saleId ? editSaleAction.bind(null, saleId) : createSaleAction;
  const [state, formAction, pending] = useActionState<OperationFormState, FormData>(action, {});
  const [cart, setCart] = useState<CartItem[]>(initialItems);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SaleProduct[]>([]);
  const [searchError, setSearchError] = useState('');
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [manualEntryError, setManualEntryError] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualQuantity, setManualQuantity] = useState('1');
  const [manualUnitPrice, setManualUnitPrice] = useState('');
  const [manualUnitCost, setManualUnitCost] = useState('');
  const [paymentMethod, setPaymentMethod] = useState(initialPaymentMethod);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(
    saleId
      ? initialAmountPaid === 0 ? 'credit' : 'partial'
      : 'paid',
  );
  const [amountPaidText, setAmountPaidText] = useState(
    initialAmountPaid ? initialAmountPaid.toFixed(2) : '',
  );
  const [customerName, setCustomerName] = useState(initialCustomerName);
  const [customerPhone, setCustomerPhone] = useState(initialCustomerPhone);
  const [idempotencyKey, setIdempotencyKey] = useState(initialIdempotencyKey);
  const [searchPending, setSearchPending] = useState(false);
  const initialQuantities = new Map(initialItems.flatMap((item) => (
    item.kind === 'catalog' ? [[item.product.id, item.quantity] as const] : []
  )));

  useEffect(() => {
    const query = search.trim();
    if (!query) return;
    let current = true;
    const timeout = window.setTimeout(() => {
      setSearchPending(true);
      void searchSaleProductsAction(query).then((result) => {
        if (current) {
          setResults(result.products);
          setSearchError(result.error ?? '');
          setSearchPending(false);
        }
      }).catch(() => {
        if (current) {
          setSearchError('Product search failed. Check your connection and try again.');
          setSearchPending(false);
        }
      });
    }, 250);
    return () => {
      current = false;
      window.clearTimeout(timeout);
    };
  }, [search]);

  function rotateKey() {
    setIdempotencyKey(crypto.randomUUID());
  }

  function addProduct(product: SaleProduct) {
    const current = cart.find((item) => item.kind === 'catalog' && item.product.id === product.id);
    const maximum = product.quantity + (initialQuantities.get(product.id) ?? 0);
    if ((current?.quantity ?? 0) >= maximum) return;
    setCart(current
      ? cart.map((item) => item.kind === 'catalog' && item.product.id === product.id
        ? { ...item, quantity: item.quantity + 1, product }
        : item)
      : [...cart, { kind: 'catalog', product, quantity: 1 }]);
    setResults([]);
    setSearch('');
    rotateKey();
  }

  function addManualItem() {
    const quantity = Number(manualQuantity);
    const unitPrice = Number(manualUnitPrice);
    const unitCost = manualUnitCost === '' ? null : Number(manualUnitCost);
    if (!manualName.trim() || manualName.trim().length > 160
      || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000000
      || !Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 9999999999.99
      || (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0 || unitCost > 9999999999.99))) {
      setManualEntryError('Enter a name, a valid quantity, and valid prices.');
      return;
    }
    setCart([...cart, {
      kind: 'manual',
      lineId: crypto.randomUUID(),
      name: manualName.trim(),
      quantity,
      unitPrice,
      unitCost: canViewCosts ? unitCost : null,
    }]);
    setManualName('');
    setManualQuantity('1');
    setManualUnitPrice('');
    setManualUnitCost('');
    setManualEntryOpen(false);
    setManualEntryError('');
    setSearch('');
    setResults([]);
    rotateKey();
  }

  function updateQuantity(lineId: string, quantity: number) {
    setCart(cart.map((item) => (
      (item.kind === 'catalog' ? item.product.id : item.lineId) === lineId
        ? { ...item, quantity }
        : item
    )));
    rotateKey();
  }

  function removeItem(lineId: string) {
    setCart(cart.filter((item) => (
      (item.kind === 'catalog' ? item.product.id : item.lineId) !== lineId
    )));
    rotateKey();
  }

  const saleTotalCents = cart.reduce((sum, item) => (
    sum + (item.kind === 'catalog'
      ? Math.round(item.product.selling_price * 100) * item.quantity
      : Math.round(item.unitPrice * 100) * item.quantity)
  ), 0);
  const minimumPaid = Math.round(initialAmountPaid * 100);
  const typedPaid = /^\d{1,10}(?:\.\d{1,2})?$/.test(amountPaidText)
    ? Math.round(Number(amountPaidText) * 100)
    : 0;
  const paidCents = saleId
    ? Math.max(minimumPaid, typedPaid)
    : paymentStatus === 'paid' ? saleTotalCents
      : paymentStatus === 'credit' ? 0 : typedPaid;
  const balanceCents = saleTotalCents - paidCents;
  const requiresCustomer = balanceCents > 0;
  const normalizedSearch = search.trim().toLowerCase();
  const hasExactProduct = results.some((product) => (
    product.name.trim().toLowerCase() === normalizedSearch
    || product.sku?.trim().toLowerCase() === normalizedSearch
  ));

  return (
    <form action={formAction} className="max-w-5xl space-y-5">
      <input type="hidden" name="items" value={JSON.stringify(cart.map((item) => (
        item.kind === 'catalog'
          ? { kind: 'catalog', product_id: item.product.id, quantity: item.quantity }
          : {
            kind: 'manual',
            name: item.name,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            unit_cost: canViewCosts ? item.unitCost : null,
          }
      )))} />
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      {saleId ? (
        <input type="hidden" name="amount_paid" value={(paidCents / 100).toFixed(2)} />
      ) : (
        <input type="hidden" name="amount_paid" value={(paidCents / 100).toFixed(2)} />
      )}
      {!saleId ? <input type="hidden" name="payment_status" value={paymentStatus} /> : null}

      <div>
        <label htmlFor="product_search" className="mb-1 block text-sm font-medium">Find a product</label>
        <input
          id="product_search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setResults([]);
            setSearchError('');
            setSearchPending(Boolean(event.target.value.trim()));
            setManualName(event.target.value);
            setManualEntryOpen(false);
          }}
          autoComplete="off"
          maxLength={100}
          aria-describedby="product-search-status"
          placeholder="Search by product name or product code"
          className="min-h-11 w-full rounded border border-neutral-300 px-3 text-sm"
        />
        <div id="product-search-status" aria-live="polite" className="mt-1 text-xs text-neutral-600">
          {searchPending ? 'Searching…' : searchError}
        </div>
        {results.length ? (
          <ul className="mt-2 divide-y divide-neutral-200 rounded border border-neutral-200" aria-label="Matching products">
            {results.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => addProduct(product)}
                  disabled={product.quantity <= 0}
                  className="flex min-h-11 w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[#F5F5F5]"
                >
                  <span>{product.name}{product.sku ? ` · ${product.sku}` : ''}</span>
                  <span className="text-neutral-600">
                    {money.format(product.selling_price)} · {product.quantity > 0 ? `${product.quantity} in stock` : 'Out of stock'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {normalizedSearch && !searchPending && !searchError && !hasExactProduct ? (
          <button
            type="button"
            onClick={() => {
              setManualEntryError('');
              setManualEntryOpen(true);
            }}
            className="mt-2 min-h-10 rounded border border-neutral-300 px-3 text-sm font-medium text-[#E31E24] hover:bg-[#F5F5F5]"
          >
            Add item to sale
          </button>
        ) : null}
        {manualEntryOpen ? (
          <fieldset className="mt-3 grid gap-3 rounded border border-neutral-200 p-3 sm:grid-cols-2 lg:grid-cols-5">
            <legend className="px-1 text-xs font-medium">Sale item</legend>
            <div>
              <label htmlFor="manual_name" className="mb-1 block text-xs font-medium">Item name</label>
              <input id="manual_name" maxLength={160} required value={manualName} onChange={(event) => {
                setManualName(event.target.value);
                setManualEntryError('');
              }} className={`${inputClass} w-full`} />
            </div>
            <div>
              <label htmlFor="manual_quantity" className="mb-1 block text-xs font-medium">Quantity</label>
              <input id="manual_quantity" type="number" min="1" max="1000000" required value={manualQuantity} onChange={(event) => {
                setManualQuantity(event.target.value);
                setManualEntryError('');
              }} className={`${inputClass} w-full`} />
            </div>
            {canViewCosts ? (
              <div>
                <label htmlFor="manual_cost" className="mb-1 block text-xs font-medium">Buying price (optional)</label>
                <input id="manual_cost" type="number" min="0" max="9999999999.99" step="0.01" value={manualUnitCost} onChange={(event) => {
                  setManualUnitCost(event.target.value);
                  setManualEntryError('');
                }} className={`${inputClass} w-full`} />
              </div>
            ) : null}
            <div>
              <label htmlFor="manual_selling_price" className="mb-1 block text-xs font-medium">Selling price</label>
              <input id="manual_selling_price" type="number" min="0" max="9999999999.99" step="0.01" required value={manualUnitPrice} onChange={(event) => {
                setManualUnitPrice(event.target.value);
                setManualEntryError('');
              }} className={`${inputClass} w-full`} />
            </div>
            <button type="button" onClick={addManualItem} className="min-h-10 self-end rounded bg-[#E31E24] px-3 text-sm font-medium !text-white hover:!text-white">
              Add to sale
            </button>
          </fieldset>
        ) : null}
        {manualEntryError ? <p role="alert" className="mt-2 text-sm text-red-700">{manualEntryError}</p> : null}
      </div>

      <div className="overflow-x-auto rounded border border-neutral-200">
        <table className="w-full min-w-[700px] border-collapse text-left text-sm">
          <thead className="bg-[#F5F5F5] text-xs uppercase text-neutral-600">
            <tr>
              <th className="px-3 py-3">Product</th>
              {canViewCosts ? <th className="px-3 py-3">Buying price</th> : null}
              <th className="px-3 py-3">Selling price</th>
              <th className="px-3 py-3">Quantity</th>
              <th className="px-3 py-3">Subtotal</th>
              <th className="px-3 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {cart.map((item) => {
              const catalogItem = item.kind === 'catalog';
              const name = catalogItem ? item.product.name : item.name;
              const lineId = catalogItem ? item.product.id : item.lineId;
              const sellingPrice = catalogItem ? item.product.selling_price : item.unitPrice;
              const buyingPrice = catalogItem ? item.product.cost_price : item.unitCost;
              const maxQuantity = catalogItem
                ? item.product.quantity + (initialQuantities.get(item.product.id) ?? 0)
                : 1000000;
              return (
                <tr key={lineId} className="border-t border-neutral-200">
                  <td className="px-3 py-3">
                    {catalogItem ? name : (
                      <input
                        aria-label="Sale item name"
                        maxLength={160}
                        required
                        value={name}
                        onChange={(event) => {
                          setCart(cart.map((line) => (
                            line.kind === 'manual' && line.lineId === lineId
                              ? { ...line, name: event.target.value }
                              : line
                          )));
                          rotateKey();
                        }}
                        className="min-h-9 w-40 rounded border border-neutral-300 px-2"
                      />
                    )}
                  </td>
                  {canViewCosts ? (
                    <td className="px-3 py-3">
                      {catalogItem
                        ? buyingPrice === null ? '—' : money.format(buyingPrice)
                        : <input aria-label="Buying price" type="number" min="0" step="0.01"
                          value={buyingPrice ?? ''} onChange={(event) => {
                            setCart(cart.map((line) => (
                            line.kind === 'manual' && line.lineId === lineId
                              ? { ...line, unitCost: event.target.value === '' ? null : Number(event.target.value) }
                              : line
                            )));
                            rotateKey();
                          }}
                          className="min-h-9 w-28 rounded border border-neutral-300 px-2" />}
                    </td>
                  ) : null}
                  <td className="px-3 py-3">
                    {catalogItem ? money.format(sellingPrice) : (
                      <input aria-label="Selling price" type="number" min="0" step="0.01"
                        value={sellingPrice} onChange={(event) => {
                          setCart(cart.map((line) => (
                            line.kind === 'manual' && line.lineId === lineId
                              ? { ...line, unitPrice: Number(event.target.value) }
                              : line
                          )));
                          rotateKey();
                        }}
                        className="min-h-9 w-28 rounded border border-neutral-300 px-2" />
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <input aria-label={`Quantity for ${name}`} type="number" min="1" max={maxQuantity}
                      value={item.quantity} onChange={(event) => {
                        const nextQuantity = Number(event.target.value);
                        if (Number.isInteger(nextQuantity) && nextQuantity >= 1 && nextQuantity <= maxQuantity) {
                          updateQuantity(lineId, nextQuantity);
                        }
                      }} className="min-h-9 w-20 rounded border border-neutral-300 px-2" />
                  </td>
                  <td className="px-3 py-3">{money.format(Math.round(sellingPrice * 100) * item.quantity / 100)}</td>
                  <td className="px-3 py-3">
                    <button type="button" onClick={() => removeItem(lineId)} className="text-[#E31E24] underline underline-offset-2">
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
            {!cart.length ? (
              <tr>
                <td colSpan={canViewCosts ? 6 : 5} className="px-3 py-8 text-center text-neutral-600">
                  Search and add products from your inventory.
                </td>
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-200 font-semibold">
              <th colSpan={canViewCosts ? 4 : 3} className="px-3 py-3 text-right">Sale total</th>
              <td className="px-3 py-3">{money.format(saleTotalCents / 100)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <section className="grid gap-3 rounded border border-neutral-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {!saleId ? (
          <div>
            <label htmlFor="payment_status" className="mb-1 block text-xs font-medium">Payment status</label>
            <select
              id="payment_status"
              value={paymentStatus}
              onChange={(event) => {
                setPaymentStatus(event.target.value as PaymentStatus);
                rotateKey();
              }}
              className={`${inputClass} w-full bg-white`}
            >
              <option value="paid">Paid in full</option>
              <option value="partial">Partially paid</option>
              <option value="credit">Credit / unpaid</option>
            </select>
          </div>
        ) : null}
        {(saleId || paymentStatus !== 'credit') ? (
          <div>
            <label htmlFor="payment_method" className="mb-1 block text-xs font-medium">
              {saleId ? 'Method for additional payment' : 'Payment method'}
            </label>
            <select
              id="payment_method"
              name="payment_method"
              value={paymentMethod}
              onChange={(event) => {
                setPaymentMethod(event.target.value);
                rotateKey();
              }}
              className={`${inputClass} w-full bg-white`}
            >
              <option value="cash">Cash</option>
              <option value="mpesa">M-Pesa</option>
              <option value="other">Other</option>
            </select>
          </div>
        ) : <input type="hidden" name="payment_method" value={paymentMethod} />}
        {saleId || paymentStatus === 'partial' ? (
          <div>
            <label htmlFor="amount_paid_input" className="mb-1 block text-xs font-medium">
              {saleId ? 'Total received' : 'Amount received'}
            </label>
            <input
              id="amount_paid_input"
              type="number"
              min={saleId ? initialAmountPaid : 0.01}
              max={saleTotalCents / 100}
              step="0.01"
              required
              value={amountPaidText}
              onChange={(event) => {
                setAmountPaidText(event.target.value);
                rotateKey();
              }}
              className={`${inputClass} w-full`}
            />
          </div>
        ) : null}
        {requiresCustomer ? (
          <>
            <div>
              <label htmlFor="customer_name" className="mb-1 block text-xs font-medium">Customer name</label>
              <input
                id="customer_name"
                name="customer_name"
                required
                maxLength={120}
                value={customerName}
                onChange={(event) => {
                  setCustomerName(event.target.value);
                  rotateKey();
                }}
                className={`${inputClass} w-full`}
              />
            </div>
            <div>
              <label htmlFor="customer_phone" className="mb-1 block text-xs font-medium">Customer phone</label>
              <input
                id="customer_phone"
                name="customer_phone"
                type="tel"
                required
                minLength={5}
                maxLength={32}
                value={customerPhone}
                onChange={(event) => {
                  setCustomerPhone(event.target.value);
                  rotateKey();
                }}
                className={`${inputClass} w-full`}
              />
            </div>
          </>
        ) : null}
        <div className="flex items-end justify-between gap-3 text-sm sm:col-span-2 lg:col-span-4">
          <span>Paid: <strong>{money.format(paidCents / 100)}</strong></span>
          <span>Remaining: <strong>{money.format(Math.max(0, balanceCents) / 100)}</strong></span>
        </div>
      </section>

      {state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}
      {state.success && state.saleId ? (
        <p role="status" className="text-sm text-[#E31E24]">
          {state.success} <Link className="underline" href={`/sales/${state.saleId}`}>View sale</Link>
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending || !idempotencyKey || !cart.length || (Boolean(saleId) && paidCents < minimumPaid)}
        className="inline-flex min-h-11 items-center rounded bg-[#E31E24] px-5 text-sm font-medium !text-white hover:!text-white disabled:!text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Saving…' : saleId ? 'Save changes' : 'Save sale'}
      </button>
      <p className="text-xs leading-5 text-neutral-600">
        Product prices and stock are checked against the MSONJO inventory when saved. M-Pesa is recorded as a payment method only; this application does not verify the transfer.
      </p>
    </form>
  );
}
