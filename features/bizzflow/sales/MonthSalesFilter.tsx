'use client';

type MonthSalesFilterProps = {
  month: string;
};

export default function MonthSalesFilter({ month }: MonthSalesFilterProps) {
  return (
    <form method="get" className="mb-5 flex flex-wrap items-end gap-3 rounded border border-neutral-200 p-3">
      <div>
        <label htmlFor="month" className="mb-1 block text-xs font-medium">Choose month</label>
        <input
          id="month"
          name="month"
          type="month"
          value={month}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="min-h-10 rounded border border-neutral-300 px-2 text-sm"
        />
      </div>
      <button className="min-h-10 rounded bg-[#E31E24] px-4 text-sm font-medium !text-white hover:!text-white">
        View sales
      </button>
    </form>
  );
}
