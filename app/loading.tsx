export default function Loading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading page"
      className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
    >
      <div className="mb-6 border-b border-neutral-200 pb-5">
        <div className="h-7 w-40 animate-pulse rounded bg-neutral-200" />
        <div className="mt-3 h-4 w-72 max-w-full animate-pulse rounded bg-neutral-100" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded border border-neutral-200 bg-neutral-50" />
        ))}
      </div>
      <div className="mt-6 h-64 animate-pulse rounded border border-neutral-200 bg-neutral-50" />
    </main>
  );
}
