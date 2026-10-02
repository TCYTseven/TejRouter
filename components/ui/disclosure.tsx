import type { ReactNode } from "react";
import { cn } from "@/lib/client/cn";
import { IconChevronRight } from "./icons";

/** Native <details> collapsible, styled. Works without JS. */
export function Disclosure({
  summary,
  children,
  defaultOpen,
  className,
  summaryClassName,
  trailing,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  summaryClassName?: string;
  trailing?: ReactNode;
}) {
  return (
    <details className={cn("group/disc", className)} open={defaultOpen}>
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-fg-muted select-none hover:text-fg [&::-webkit-details-marker]:hidden",
          summaryClassName,
        )}
      >
        <IconChevronRight size={12} className="transition-transform duration-150 group-open/disc:rotate-90" />
        <span className="flex-1">{summary}</span>
        {trailing}
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  );
}
