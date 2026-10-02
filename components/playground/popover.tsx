"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/client/cn";

/**
 * Click-to-open popover anchored under its trigger. Closes on outside click
 * and Escape. `trigger` receives the props a button needs to announce it.
 */
export function Popover({
  trigger,
  children,
  align = "start",
  label,
  className,
}: {
  trigger: (t: {
    open: boolean;
    toggle: () => void;
    props: { "aria-expanded": boolean; "aria-controls": string; "aria-haspopup": "dialog" };
  }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "start" | "end";
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={ref} className="relative">
      {trigger({
        open,
        toggle: () => setOpen((o) => !o),
        props: { "aria-expanded": open, "aria-controls": id, "aria-haspopup": "dialog" },
      })}
      {open ? (
        <div
          id={id}
          role="dialog"
          aria-label={label}
          className={cn(
            "absolute top-full z-40 mt-2 w-[min(340px,calc(100vw-2rem))] rounded-xl border border-border-strong bg-surface shadow-lg",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      ) : null}
    </div>
  );
}
