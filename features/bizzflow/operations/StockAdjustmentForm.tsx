'use client';

import { useActionState, useState } from 'react';
import { adjustStockAction, type OperationFormState } from './actions';

export default function StockAdjustmentForm({ productId, operationKey }: { productId: string; operationKey: string }) {
  const [state, formAction, pending] = useActionState<OperationFormState, FormData>(adjustStockAction, {});
  const [currentOperationKey, setCurrentOperationKey] = useState(operationKey);
  const rotateOperationKey = () => setCurrentOperationKey(crypto.randomUUID());

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="product_id" value={productId} />
      <input type="hidden" name="operation_key" value={currentOperationKey} />
      <div>
        <label htmlFor="movement_type" className="mb-1 block text-sm font-medium">Movement</label>
        <select id="movement_type" name="movement_type" onChange={rotateOperationKey} className="min-h-11 w-full rounded border border-neutral-300 bg-white px-3 text-sm">
          <option value="restock">Stock received</option>
          <option value="adjustment">Adjustment</option>
          <option value="damaged">Damaged stock</option>
          <option value="lost">Lost stock</option>
          <option value="correction">Correction</option>
        </select>
      </div>
      <div>
        <label htmlFor="quantity_change" className="mb-1 block text-sm font-medium">Signed quantity change</label>
        <input id="quantity_change" name="quantity_change" required type="number" step="1" min="-2147483647" max="2147483647" onChange={rotateOperationKey}
          aria-describedby="quantity-change-help"
          className="min-h-11 w-full rounded border border-neutral-300 px-3 text-sm" />
        <p id="quantity-change-help" className="mt-1 text-xs text-neutral-600">Use positive for additions and negative for removals.</p>
      </div>
      <div>
        <label htmlFor="reason" className="mb-1 block text-sm font-medium">Reason <span className="font-normal text-neutral-600">Optional</span></label>
        <input id="reason" name="reason" maxLength={500} onChange={rotateOperationKey} className="min-h-11 w-full rounded border border-neutral-300 px-3 text-sm" />
      </div>
      {state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}
      {state.success ? <p role="status" className="text-sm text-[#E31E24]">{state.success}</p> : null}
      <button type="submit" disabled={pending || !currentOperationKey}
        className="inline-flex min-h-11 items-center rounded bg-[#E31E24] px-4 text-sm font-medium !text-white hover:!text-white disabled:!text-white disabled:cursor-not-allowed disabled:opacity-60">
        {pending ? 'Saving…' : 'Save stock adjustment'}
      </button>
    </form>
  );
}
