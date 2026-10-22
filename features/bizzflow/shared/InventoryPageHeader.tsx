import Link from 'next/link';

export default function InventoryPageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b border-neutral-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-[#252525]">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-600">{description}</p>
      </div>
      {action ? (
        <Link
          href={action.href}
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded bg-[#E31E24] px-4 text-sm font-medium !text-white no-underline hover:bg-[#E31E24] hover:!text-white focus-visible:!text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E31E24]"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
