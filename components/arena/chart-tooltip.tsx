import type { ReactNode } from "react";

/**
 * Floating readout for the SVG charts. Positioned in the chart container's
 * coordinates and flipped to stay inside it. Value first, label second.
 */
export function ChartTooltip({
  x,
  y,
  containerWidth,
  children,
}: {
  x: number;
  y: number;
  containerWidth: number;
  children: ReactNode;
}) {
  const w = 220;
  const left = Math.max(4, Math.min(containerWidth - w - 4, x + 14 + w > containerWidth ? x - w - 14 : x + 14));
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-20 rounded-md border border-border-strong bg-surface px-2.5 py-2 text-[11px] leading-snug text-fg shadow-lg"
      style={{ left, top: y, width: w, transform: "translateY(-50%)" }}
    >
      {children}
    </div>
  );
}
