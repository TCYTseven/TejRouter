"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/client/cn";

export interface TabItem<T extends string = string> {
  value: T;
  label: ReactNode;
  count?: number;
}

/**
 * Controlled tabs with WAI-ARIA roles and arrow-key navigation.
 * Render panels with <TabPanel>, passing the same `idBase` and value.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
  idBase: idBaseProp,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
  idBase?: string;
}) {
  const auto = useId();
  const idBase = idBaseProp ?? auto;
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent) => {
    const i = items.findIndex((t) => t.value === value);
    let n = -1;
    if (e.key === "ArrowRight") n = (i + 1) % items.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + items.length) % items.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = items.length - 1;
    if (n >= 0) {
      e.preventDefault();
      onChange(items[n].value);
      ref.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[n]?.focus();
    }
  };
  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={label}
      onKeyDown={onKey}
      className={cn("flex items-center gap-1 overflow-x-auto border-b border-border", className)}
    >
      {items.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            id={`${idBase}-tab-${t.value}`}
            aria-selected={active}
            aria-controls={`${idBase}-panel-${t.value}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.value)}
            className={cn(
              "relative -mb-px inline-flex h-10 items-center gap-1.5 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors",
              active ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {t.label}
            {t.count != null ? <span className="num rounded-md bg-surface-2 px-1.5 text-[13px] text-fg-muted">{t.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  idBase,
  value,
  active,
  children,
  className,
}: {
  idBase: string;
  value: string;
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="tabpanel"
      id={`${idBase}-panel-${value}`}
      aria-labelledby={`${idBase}-tab-${value}`}
      hidden={!active}
      className={className}
    >
      {active ? children : null}
    </div>
  );
}
