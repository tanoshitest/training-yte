export default function Loading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="h-7 w-48 animate-pulse rounded-md bg-slate-200" />
      <div className="h-4 w-80 animate-pulse rounded-md bg-slate-100" />
      <div className="flex-1 animate-pulse rounded-xl border border-slate-200 bg-white" />
    </div>
  );
}
