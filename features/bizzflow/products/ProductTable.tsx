'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formatKes, type ProductRow } from '@/lib/bizzflow/operations-data';
import {
  archiveProductAction,
  deleteProductAction,
} from '@/features/bizzflow/operations/actions';

function stockStatus(product: ProductRow) {
  if (product.is_archived) return 'Archived';
  if (product.quantity === 0) return 'Out of stock';
  if (product.quantity <= product.low_stock_threshold) return 'Low stock';
  return 'In stock';
}

function productDetails(product: ProductRow, canManage: boolean) {
  return [
    ['Product name', product.name],
    ['Product code', product.sku || '—'],
    ['Category', product.category || '—'],
    ...(canManage
      ? [['Cost price', product.cost_price === null ? '—' : formatKes(product.cost_price)]]
      : []),
    ['Selling price', formatKes(product.selling_price)],
    ['Quantity on hand', String(product.quantity)],
    ['Stock status', stockStatus(product)],
    ['Low-stock threshold', String(product.low_stock_threshold)],
    ...(canManage && product.cost_price !== null
      ? [['Stock value at cost', formatKes(product.cost_price * product.quantity)]]
      : []),
  ];
}

export default function ProductTable({
  products,
  canManage,
}: {
  products: ProductRow[];
  canManage: boolean;
}) {
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-left text-sm">
          <thead className="bg-[#F5F5F5] text-xs font-medium uppercase tracking-wide text-neutral-600">
            <tr>
              <th scope="col" className="px-3 py-2.5">Product</th>
              <th scope="col" className="px-3 py-2.5">Product code</th>
              <th scope="col" className="px-3 py-2.5">Category</th>
              {canManage ? <th scope="col" className="px-3 py-2.5 text-right">Cost price</th> : null}
              <th scope="col" className="px-3 py-2.5 text-right">Selling price</th>
              <th scope="col" className="px-3 py-2.5 text-right">On hand</th>
              <th scope="col" className="px-3 py-2.5">Status</th>
              <th scope="col" className="px-3 py-2.5 text-right">Details</th>
              <th scope="col" className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const status = stockStatus(product);
              const expanded = expandedProductId === product.id;
              return (
                <FragmentRows
                  key={product.id}
                  product={product}
                  canManage={canManage}
                  status={status}
                  expanded={expanded}
                  onToggle={() => setExpandedProductId(expanded ? null : product.id)}
                />
              );
            })}
            {!products.length ? (
              <tr>
                <td colSpan={canManage ? 9 : 8} className="px-4 py-10 text-center">
                  <p className="font-medium text-[#252525]">No active products found</p>
                  <p className="mt-1 text-sm text-neutral-600">
                    Add your first product to start tracking stock, or adjust the filters.
                  </p>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRows({
  product,
  canManage,
  status,
  expanded,
  onToggle,
}: {
  product: ProductRow;
  canManage: boolean;
  status: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const details = productDetails(product, canManage);

  return (
    <>
      <tr className="border-t border-neutral-200">
        <td className="px-3 py-2 font-medium">
          <Link
            href={`/products/${product.id}`}
            className="text-[#B91C1C] underline underline-offset-2"
          >
            {product.name}
          </Link>
        </td>
        <td className="px-3 py-2 text-neutral-600">{product.sku || '—'}</td>
        <td className="px-3 py-2 text-neutral-600">{product.category || '—'}</td>
        {canManage ? (
          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
            {product.cost_price === null ? '—' : formatKes(product.cost_price)}
          </td>
        ) : null}
        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
          {formatKes(product.selling_price)}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{product.quantity}</td>
        <td className="px-3 py-2">
          <span className={`whitespace-nowrap rounded px-2 py-1 text-xs font-medium ${
            status === 'In stock'
              ? 'bg-emerald-50 text-emerald-800'
              : status === 'Archived'
                ? 'bg-neutral-100 text-neutral-700'
                : 'bg-amber-100 text-amber-900'
          }`}>
            {status}
          </span>
        </td>
        <td className="px-3 py-2 text-right">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={`product-details-${product.id}`}
            onClick={onToggle}
            className="inline-flex min-h-8 items-center gap-1 rounded px-2 text-xs font-medium text-[#B91C1C] hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E31E24]"
          >
            {expanded ? 'Hide' : 'View'}
            {expanded
              ? <ChevronDown aria-hidden="true" className="size-3.5" />
              : <ChevronRight aria-hidden="true" className="size-3.5" />}
          </button>
        </td>
        <td className="px-3 py-2 text-right">
          <div className="flex justify-end gap-1">
            {!product.is_archived ? (
              <form action={archiveProductAction}>
                <input type="hidden" name="product_id" value={product.id} />
                <button
                  type="submit"
                  className="inline-flex min-h-8 items-center rounded px-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E31E24]"
                >
                  Archive
                </button>
              </form>
            ) : null}
            <form
              action={deleteProductAction}
              onSubmit={(event) => {
                if (!window.confirm(
                  `Permanently delete "${product.name}"? This cannot be undone. Products with sales or stock history cannot be deleted; archive those instead.`,
                )) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="product_id" value={product.id} />
              <button
                type="submit"
                className="inline-flex min-h-8 items-center rounded px-2 text-xs font-medium text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E31E24]"
              >
                Delete
              </button>
            </form>
          </div>
        </td>
      </tr>
      {expanded ? (
        <tr id={`product-details-${product.id}`} className="border-t border-neutral-100 bg-neutral-50">
          <td colSpan={canManage ? 9 : 8} className="px-4 py-4">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              {details.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-neutral-500">{label}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-[#252525]">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap gap-4 border-t border-neutral-200 pt-3">
              <Link
                href={`/products/${product.id}`}
                className="text-sm font-medium text-[#B91C1C] underline underline-offset-2"
              >
                Open full product details
              </Link>
              {canManage && !product.is_archived ? (
                <Link
                  href={`/products/${product.id}/edit`}
                  className="text-sm font-medium text-[#B91C1C] underline underline-offset-2"
                >
                  Edit product
                </Link>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
