import type { ReactNode } from "react";
import { cn } from "@/lib/client/cn";

export function EmptyState({
  title,
  description,
  action,
  className,
  compact,
}: {
  /** Ignored: empty states carry no icon tiles (CONTRIBUTING.md, "Design rules"). */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-border bg-surface text-center",
        compact ? "gap-2 px-5 py-8" : "gap-3 px-6 py-14",
        className,
      )}
    >
      <div className="space-y-1">
        <p className="text-[15px] font-medium text-fg">{title}</p>
        {description ? <p className="mx-auto max-w-sm text-sm text-fg-muted">{description}</p> : null}
      </div>
      {action ? <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}
