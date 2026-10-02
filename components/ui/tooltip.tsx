import type { ReactNode } from "react";
import { cn } from "@/lib/client/cn";

/**
 * CSS-only tooltip: shows on hover and on keyboard focus within the trigger.
 * The content is also exposed to assistive tech via a visually-hidden span,
 * so a tooltip never gates information.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  className,
  align = "center",
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  align?: "center" | "start" | "end";
  className?: string;
}) {
  return (
    <span className={cn("group/tt relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 w-max max-w-72 rounded-lg border border-border bg-surface px-3 py-2 text-[13px] leading-snug text-fg opacity-0 shadow-lg",
          "transition-[opacity,transform] duration-100 group-hover/tt:opacity-100 group-focus-within/tt:opacity-100",
          side === "top" ? "bottom-full mb-1.5 translate-y-0.5 group-hover/tt:translate-y-0" : "top-full mt-1.5 -translate-y-0.5 group-hover/tt:translate-y-0",
          align === "center" && "left-1/2 -translate-x-1/2",
          align === "start" && "left-0",
          align === "end" && "right-0",
        )}
      >
        {content}
      </span>
    </span>
  );
}
