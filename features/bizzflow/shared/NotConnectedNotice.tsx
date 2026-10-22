export default function NotConnectedNotice({
  children = 'Connect a business account to load real data. No business records are connected or displayed yet.',
}: {
  children?: string;
}) {
  return (
    <div
      role="note"
      className="rounded border border-neutral-200 bg-[#F5F5F5] px-4 py-3 text-sm leading-6 text-neutral-700"
    >
      {children}
    </div>
  );
}
