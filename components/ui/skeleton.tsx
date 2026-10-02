import type { HTMLAttributes } from "react";
import { cn } from "@/lib/client/cn";

export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("skeleton rounded-md", className)} {...rest} />;
}

/** A few lines of text-shaped skeleton. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton h-3 rounded" style={{ width: `${i === lines - 1 ? 60 : 100 - i * 7}%` }} />
      ))}
    </div>
  );
}
