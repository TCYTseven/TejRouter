"use client";

import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/client/cn";
import { AxisBottom, AxisLeft, CHAR_W, GridX, GridY } from "./axis";
import { linearScale, logScale, type Scale } from "./scale";
import { ChartTooltip, useChartTooltip } from "./tooltip";
import { useElementWidth } from "./use-width";
import styles from "./viz.module.css";

export interface AxisSpec {
  type?: "linear" | "log";
  domain: [number, number];
  format: (v: number) => string;
  /** Axis title (x: under the axis, right-aligned; y: above the axis, left-aligned). */
  label?: string;
  /** Explicit ticks; default nice ticks. */
  ticks?: number[];
  tickCount?: number;
  /** Draw vertical gridlines for x ticks (default false: one direction of grid only). */
  grid?: boolean;
}

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface XYContext {
  x: Scale;
  y: Scale;
  innerWidth: number;
  innerHeight: number;
  width: number;
  /** Tooltip binder for interactive marks (see useChartTooltip). */
  bind: ReturnType<typeof useChartTooltip>["bind"];
  hide: () => void;
}

export interface CrosshairSpec {
  /** Candidate x values to snap to (sorted). Without it, x follows the pointer. */
  values?: number[];
  /** Tooltip content at x. */
  content: (x: number) => ReactNode;
  /** Optional markers to draw at x (e.g. dots on each line). */
  markers?: (x: number, ctx: XYContext) => ReactNode;
  /** Keyboard steps when `values` is not given (default 40). */
  steps?: number;
}

/**
 * Responsive cartesian frame: measures its width, builds x/y scales, draws
 * recessive gridlines and axes, then renders `children(ctx)` (passive marks),
 * an optional crosshair layer (hairline + one tooltip listing every series,
 * keyboard-steppable with arrow keys) and `overlay(ctx)` (interactive marks).
 */
export function XYChart({
  ariaLabel,
  description,
  height = 260,
  x: xSpec,
  y: ySpec,
  margin: marginProp,
  crosshair,
  children,
  overlay,
  className,
  minWidth = 0,
}: {
  ariaLabel: string;
  description?: string;
  /** Total height in px, including axes. */
  height?: number;
  x: AxisSpec;
  y: AxisSpec;
  margin?: Partial<Margin>;
  crosshair?: CrosshairSpec;
  children?: (ctx: XYContext) => ReactNode;
  overlay?: (ctx: XYContext) => ReactNode;
  className?: string;
  /** Below this width the chart scrolls inside its own container. */
  minWidth?: number;
}) {
  const [measureRef, measured] = useElementWidth<HTMLDivElement>();
  const { containerRef, tip, bind, showAt, hide } = useChartTooltip();
  const [hoverX, setHoverX] = useState<number | null>(null);
  const uid = useId().replace(/:/g, "");
  const width = Math.max(measured, minWidth);

  const yTicksRaw = useMemo(() => {
    const s = (ySpec.type === "log" ? logScale : linearScale)(ySpec.domain, [1, 0]);
    return ySpec.ticks ?? s.ticks(ySpec.tickCount ?? 4);
  }, [ySpec.domain, ySpec.ticks, ySpec.tickCount, ySpec.type]);
  const yLabelWidth = Math.max(...yTicksRaw.map((t) => ySpec.format(t).length), 2) * CHAR_W + 14;

  const margin: Margin = {
    top: ySpec.label ? 28 : 12,
    right: 16,
    bottom: xSpec.label ? 46 : 28,
    left: Math.ceil(yLabelWidth),
    ...marginProp,
  };
  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = Math.max(10, height - margin.top - margin.bottom);

  const x = useMemo(
    () => (xSpec.type === "log" ? logScale : linearScale)(xSpec.domain, [0, innerWidth]),
    [xSpec.type, xSpec.domain, innerWidth],
  );
  const y = useMemo(
    () => (ySpec.type === "log" ? logScale : linearScale)(ySpec.domain, [innerHeight, 0]),
    [ySpec.type, ySpec.domain, innerHeight],
  );
  const xTicks = xSpec.ticks ?? x.ticks(xSpec.tickCount ?? Math.max(2, Math.min(7, Math.floor(innerWidth / 100))));
  const yTicks = yTicksRaw;

  const ctx: XYContext = { x, y, innerWidth, innerHeight, width, bind, hide };

  const snap = (v: number) => {
    const vals = crosshair?.values;
    if (!vals || vals.length === 0) return v;
    let best = vals[0];
    for (const c of vals) if (Math.abs(x(c) - x(v)) < Math.abs(x(best) - x(v))) best = c;
    return best;
  };

  const placeTip = (xv: number, clientY?: number) => {
    const el = containerRef.current;
    if (!el || !crosshair) return;
    const r = el.getBoundingClientRect();
    const cy = clientY ?? r.top + margin.top + 24;
    showAt(r.left + margin.left + x(xv), Math.max(r.top + margin.top + 30, cy - 8), crosshair.content(xv));
  };

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xv = snap(x.invert(e.clientX - rect.left));
    setHoverX(xv);
    placeTip(xv, e.clientY);
  };

  const onKey = (e: KeyboardEvent<SVGRectElement>) => {
    if (!crosshair) return;
    const vals = crosshair.values;
    const steps = crosshair.steps ?? 40;
    let next: number | null = null;
    if (e.key === "Escape") {
      setHoverX(null);
      hide();
      return;
    }
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    if (vals && vals.length) {
      const i = hoverX == null ? -1 : vals.indexOf(hoverX);
      const n = e.key === "Home" ? 0 : e.key === "End" ? vals.length - 1 : e.key === "ArrowRight" ? Math.min(vals.length - 1, i + 1) : Math.max(0, (i < 0 ? vals.length : i) - 1);
      next = vals[n];
    } else {
      const px = hoverX == null ? (e.key === "ArrowLeft" ? innerWidth : 0) : x(hoverX);
      const step = innerWidth / steps;
      const npx = e.key === "Home" ? 0 : e.key === "End" ? innerWidth : Math.min(innerWidth, Math.max(0, px + (e.key === "ArrowRight" ? step : -step)));
      next = x.invert(npx);
    }
    setHoverX(next);
    placeTip(next);
  };

  return (
    <div ref={measureRef} className={cn(styles.viz, "w-full", minWidth > 0 && "overflow-x-auto", className)}>
      <div ref={containerRef} className="relative" style={{ width: width || "100%", height }} onKeyDown={(e) => e.key === "Escape" && hide()}>
        {width > 0 ? (
          <svg width={width} height={height} role="group" aria-labelledby={`${uid}-t`} aria-describedby={description ? `${uid}-d` : undefined} className="block overflow-visible">
            <title id={`${uid}-t`}>{ariaLabel}</title>
            {description ? <desc id={`${uid}-d`}>{description}</desc> : null}
            <defs>
              <clipPath id={`${uid}-clip`}>
                <rect x={-2} y={-4} width={innerWidth + 4} height={innerHeight + 8} />
              </clipPath>
            </defs>
            <g transform={`translate(${margin.left},${margin.top})`}>
              <GridY scale={y} ticks={yTicks} width={innerWidth} />
              {xSpec.grid ? <GridX scale={x} ticks={xTicks} height={innerHeight} /> : null}
              <AxisLeft scale={y} ticks={yTicks} format={ySpec.format} label={ySpec.label} />
              <AxisBottom scale={x} ticks={xTicks} y={innerHeight} format={xSpec.format} label={xSpec.label} width={innerWidth} />
              <g clipPath={`url(#${uid}-clip)`}>{children?.(ctx)}</g>
              {crosshair ? (
                <>
                  {hoverX != null ? (
                    <g pointerEvents="none">
                      <line x1={x(hoverX)} x2={x(hoverX)} y1={0} y2={innerHeight} stroke="var(--viz-ink-2)" strokeOpacity={0.5} strokeWidth={1} />
                      {crosshair.markers?.(hoverX, ctx)}
                    </g>
                  ) : null}
                  <rect
                    x={0}
                    y={0}
                    width={innerWidth}
                    height={innerHeight}
                    fill="transparent"
                    tabIndex={0}
                    role="img"
                    aria-label={`${ariaLabel}. Use left and right arrow keys to read values.`}
                    className="cursor-crosshair outline-none focus-visible:[outline:2px_solid_var(--ring)]"
                    onPointerMove={onMove}
                    onPointerDown={onMove}
                    onPointerLeave={() => {
                      setHoverX(null);
                      hide();
                    }}
                    onKeyDown={onKey}
                    onBlur={() => {
                      setHoverX(null);
                      hide();
                    }}
                  />
                </>
              ) : null}
              {overlay?.(ctx)}
            </g>
          </svg>
        ) : null}
        <ChartTooltip tip={tip} containerWidth={width} />
      </div>
    </div>
  );
}
