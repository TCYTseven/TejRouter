"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/client/cn";

/** Accessible switch (role="switch"). */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  id,
  disabled,
  className,
  size = "md",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  id?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
}) {
  const track = size === "sm" ? "h-4 w-7" : "h-5 w-9";
  const knob = size === "sm" ? "h-3 w-3" : "h-4 w-4";
  const shift = size === "sm" ? "translate-x-3" : "translate-x-4";
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2.5 select-none", disabled && "cursor-not-allowed opacity-50", className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex shrink-0 items-center rounded-full border p-[1px] transition-colors duration-150",
          track,
          checked ? "border-accent bg-accent" : "border-border-strong bg-surface-3",
        )}
      >
        <span
          className={cn(
            "inline-block rounded-full shadow-sm transition-transform duration-150",
            knob,
            checked ? cn(shift, "bg-accent-fg") : "translate-x-0 bg-fg-muted",
          )}
        />
      </button>
      {label || description ? (
        <span className="flex flex-col">
          {label ? <span className="text-xs font-medium text-fg">{label}</span> : null}
          {description ? <span className="text-[11px] text-fg-subtle">{description}</span> : null}
        </span>
      ) : null}
    </label>
  );
}
