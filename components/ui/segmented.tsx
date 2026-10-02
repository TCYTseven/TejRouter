"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/client/cn";

/** Single-choice segmented control (radio group semantics). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  size = "sm",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode; title?: string }[];
  /** Accessible group label. */
  label: string;
  className?: string;
  size?: "xs" | "sm";
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex items-center gap-0.5 rounded-md border border-border bg-surface-2 p-0.5", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1 rounded-[5px] font-medium transition-colors",
              size === "xs" ? "h-5 px-1.5 text-[11px]" : "h-6 px-2 text-xs",
              active ? "bg-surface text-fg shadow-sm ring-1 ring-border-strong" : "text-fg-muted hover:text-fg",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
