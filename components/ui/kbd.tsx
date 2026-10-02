import type { HTMLAttributes } from "react";
import { cn } from "@/lib/client/cn";

export function Kbd({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-2 px-1 text-xs font-medium text-fg-muted",
        className,
      )}
      {...rest}
    />
  );
}
