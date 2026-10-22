'use client';

import { useActionState } from 'react';
import {
  createProductAction,
  updateProductAction,
  type OperationFormState,
} from './actions';

type ProductFormValue = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  cost_price: number;
  selling_price: number;
  low_stock_threshold: number;
};

export default function ProductForm({ product, initialOperationKey = '' }: { product?: ProductFormValue; initialOperationKey?: string }) {
  const action = product ? updateProductAction.bind(null, product.id) : createProductAction;
  const [state, formAction, pending] = useActionState<OperationFormState, FormData>(action, {});
  const operationKey = initialOperationKey;

  return (
    <form action={formAction} className="max-w-2xl space-y-5">
      {!product ? <input type="hidden" name="operation_key" value={operationKey} /> : null}
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium">Product name</label>
        <input id="name" name="name" required maxLength={160} defaultValue={product?.name}
          className="min-h-11 w-full rounded border border-neutral-300 px-3 text-sm focus-visible:outline-2 focus-visible:outline-[#E31E24]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sku" className="mb-1 block text-sm font-medium">Product code <span className="font-normal text-neutral-600">Optional</span></label>
          <input id="sku" name="sku" maxLength={100} defaultValue={product?.sku ?? ''}
            className="min-h-11 w-full rounded border border-neutral-300 px-3 text-sm focus-visible:outline-2 focus-visible:outline-[#E31E24]" />
        </div>
        <div>
          <label htmlFor="category" className="mb-1 block text-sm font-medium">Category <span className="font-normal text-neutral-600">Optional</span></label>
          <input id="category" name="category" maxLength={100} defaultValue={product?.category ?? ''}
            className="min-h-11 w-full rounded border border-neutral-300 px-3 text-sm focus-visible:outline-2 focus-visible:outline-[#E31E24]" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cost_price" className="mb-1 block text-sm font-medium">Cost price</label>
          <input id="cost_price" name="cost_price" required type="number" min="0" step="0.01" defaultValue={product?.cost_price}
            className="min-h-11 w-full rounded border border-neutral-300 px-3 text-sm focus-visible:outline-2 focus-visible:outline-[#E31E24]" />
        </div>
        <div>
          <label htmlFor="selling_price" className="mb-1 block text-sm font-medium">Selling price</label>
          <input id="selling_price" name="selling_price" required type="number" min="0" step="0.01" defaultValue={product?.selling_price}
            className="min-h-11 w-full rounded border border-neutral-300 px-3 text-sm focus-visible:outline-2 focus-visible:outline-[#E31E24]" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="low_stock_threshold" className="mb-1 block text-sm font-medium">Low-stock threshold</label>
          <input id="low_stock_threshold" name="low_stock_threshold" required type="number" min="0" step="1"
            defaultValue={product?.low_stock_threshold ?? 5}
            className="min-h-11 w-full rounded border border-neutral-300 px-3 text-sm focus-visible:outline-2 focus-visible:outline-[#E31E24]" />
        </div>
        {!product ? (
          <div>
            <label htmlFor="initial_quantity" className="mb-1 block text-sm font-medium">Initial stock</label>
            <input id="initial_quantity" name="initial_quantity" required type="number" min="0" step="1" defaultValue="0"
              className="min-h-11 w-full rounded border border-neutral-300 px-3 text-sm focus-visible:outline-2 focus-visible:outline-[#E31E24]" />
          </div>
        ) : null}
      </div>
      {state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}
      {state.success ? <p role="status" className="text-sm text-[#E31E24]">{state.success}</p> : null}
      <button type="submit" disabled={pending || (!product && !operationKey)}
        className="inline-flex min-h-11 items-center rounded bg-[#E31E24] px-4 text-sm font-medium !text-white hover:bg-[#E31E24] hover:!text-white disabled:!text-white disabled:cursor-not-allowed disabled:opacity-60">
        {pending ? 'Saving…' : product ? 'Save product' : 'Create product'}
      </button>
    </form>
  );
}
