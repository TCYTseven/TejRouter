import type { ReactNode } from "react";
import { cn } from "@/lib/client/cn";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: {
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
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border-strong text-center",
        compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-12",
        "bg-[radial-gradient(circle_at_50%_0%,var(--surface-2),transparent_70%)]",
        className,
      )}
    >
      {icon ? (
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-2 text-fg-muted">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-medium text-fg">{title}</p>
        {description ? <p className="mx-auto max-w-sm text-xs leading-relaxed text-fg-muted">{description}</p> : null}
      </div>
      {action ? <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}
