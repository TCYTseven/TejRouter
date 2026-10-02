import type { HTMLAttributes } from "react";
import { cn } from "@/lib/client/cn";

export function Kbd({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border-strong bg-surface-2 px-1 font-mono text-[10px] font-medium text-fg-muted shadow-[inset_0_-1px_0_var(--border-strong)]",
        className,
      )}
      {...rest}
    />
  );
}
