import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading page" className="animate-fade-in">
      <div className="flex flex-col gap-3 pb-6">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface p-3">
            <Skeleton className="mb-2 h-3 w-20" />
            <Skeleton className="h-6 w-24" />
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-4 lg:col-span-2">
          <SkeletonText lines={6} />
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <SkeletonText lines={4} />
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
