"use client";

import { useCallback, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/client/cn";

export interface TipState {
  x: number;
  y: number;
  content: ReactNode;
}

type Content = ReactNode | (() => ReactNode);
const resolve = (c: Content): ReactNode => (typeof c === "function" ? (c as () => ReactNode)() : c);

/**
 * Shared hover/focus tooltip for a chart. Attach `containerRef` to a
 * `position: relative` wrapper, spread `bind(content)` onto any mark (SVG or
 * HTML) and render <ChartTooltip tip={tip} />. Keyboard focus shows the same
 * content as hover; Escape or blur hides it.
 */
export function useChartTooltip() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<TipState | null>(null);

  const showAt = useCallback((clientX: number, clientY: number, content: ReactNode) => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setTip({ x: clientX - r.left, y: clientY - r.top, content });
  }, []);

  const showFor = useCallback(
    (target: Element, content: ReactNode) => {
      const r = target.getBoundingClientRect();
      showAt(r.left + r.width / 2, r.top, content);
    },
    [showAt],
  );

  const hide = useCallback(() => setTip(null), []);

  const bind = useCallback(
    (content: Content) => ({
      onPointerEnter: (e: PointerEvent<Element>) => showAt(e.clientX, e.clientY - 6, resolve(content)),
      onPointerMove: (e: PointerEvent<Element>) => showAt(e.clientX, e.clientY - 6, resolve(content)),
      onPointerLeave: () => setTip(null),
      onFocus: (e: FocusEvent<Element>) => showFor(e.currentTarget, resolve(content)),
      onBlur: () => setTip(null),
    }),
    [showAt, showFor],
  );

  return { containerRef, tip, bind, showAt, showFor, hide };
}

/** Floating tooltip box, clamped inside its container. */
export function ChartTooltip({ tip, containerWidth }: { tip: TipState | null; containerWidth?: number }) {
  if (!tip) return null;
  const w = containerWidth ?? 0;
  const edge = w > 0 && tip.x > w - 110 ? "end" : tip.x < 110 ? "start" : "center";
  const below = tip.y < 70;
  return (
    <div
      role="tooltip"
      className={cn(
        "pointer-events-none absolute z-40 w-max max-w-[min(18rem,90vw)] rounded-md border border-border-strong bg-surface px-2.5 py-2 text-[11px] leading-snug text-fg shadow-lg",
        "animate-fade-in",
      )}
      style={{
        left: tip.x,
        top: tip.y,
        transform: `translate(${edge === "center" ? "-50%" : edge === "end" ? "calc(-100% + 12px)" : "-12px"}, ${below ? "18px" : "calc(-100% - 8px)"})`,
      }}
    >
      {tip.content}
    </div>
  );
}

/** Tooltip title line (category / x value). */
export function TipTitle({ children }: { children: ReactNode }) {
  return <div className="mb-1 text-[11px] font-medium text-fg-muted">{children}</div>;
}

/** One tooltip row: value leads (strong), label follows; keyed by a short line of the series color. */
export function TipRow({
  color,
  label,
  value,
  shape = "line",
  sub,
}: {
  color?: string;
  label: ReactNode;
  value: ReactNode;
  shape?: "line" | "dot" | "rect" | "none";
  sub?: ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2 py-px">
      {color && shape !== "none" ? (
        <span
          aria-hidden="true"
          className={cn("relative top-[-2px] inline-block shrink-0", shape === "line" ? "h-[2px] w-3 rounded-full" : shape === "dot" ? "h-2 w-2 rounded-full" : "h-2 w-2 rounded-[2px]")}
          style={{ background: color }}
        />
      ) : null}
      <span className="num font-semibold text-fg">{value}</span>
      <span className="min-w-0 truncate text-fg-muted">{label}</span>
      {sub ? <span className="num text-fg-subtle">{sub}</span> : null}
    </div>
  );
}

/** Small note line in a tooltip. */
export function TipNote({ children }: { children: ReactNode }) {
  return <div className="mt-1 max-w-64 text-[10.5px] leading-snug text-fg-subtle">{children}</div>;
}
