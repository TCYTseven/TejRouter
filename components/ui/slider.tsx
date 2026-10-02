"use client";

import { cn } from "@/lib/client/cn";

/** Range slider with a numeric readout. Styled with accent-color for native a11y. */
export function Slider({
  id,
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  format = (v) => String(v),
  className,
  disabled,
}: {
  id: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
  format?: (v: number) => string;
  className?: string;
  disabled?: boolean;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-xs font-medium text-fg-muted">
          {label}
        </label>
        <output htmlFor={id} className="num text-xs text-fg">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full accent-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, var(--surface-3) ${pct}%, var(--surface-3) 100%)`,
        }}
      />
    </div>
  );
}
