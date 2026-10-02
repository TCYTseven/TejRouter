/**
 * Minimal scales and "nice" ticks for hand-rolled SVG charts.
 * A Scale maps a data value to a pixel and back; `ticks()` returns round values.
 */

export interface Scale {
  (v: number): number;
  type: "linear" | "log";
  domain: [number, number];
  range: [number, number];
  invert: (px: number) => number;
  ticks: (count?: number) => number[];
}

/** Round step for a span divided into ~count intervals: 1, 2, 2.5 or 5 × 10^k. */
export function niceStep(span: number, count: number): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const raw = span / Math.max(1, count);
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * pow;
}

/** Ticks covering [min, max] at a nice step (inclusive, floating-point cleaned). */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const step = niceStep(max - min, count);
  const start = Math.ceil(min / step - 1e-9) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

/** Expand [min, max] outward to nice round bounds. */
export function niceDomain(min: number, max: number, count = 5): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    return [min - pad, max + pad];
  }
  const step = niceStep(max - min, count);
  return [Math.floor(min / step + 1e-9) * step, Math.ceil(max / step - 1e-9) * step];
}

export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const s = ((v: number) => r0 + (v - d0) * k) as Scale;
  s.type = "linear";
  s.domain = domain;
  s.range = range;
  s.invert = (px: number) => (k === 0 ? d0 : d0 + (px - r0) / k);
  s.ticks = (count = 5) => niceTicks(Math.min(d0, d1), Math.max(d0, d1), count);
  return s;
}

/** Log10 scale; non-positive inputs are clamped to the domain minimum. */
export function logScale(domain: [number, number], range: [number, number]): Scale {
  const lo = Math.max(domain[0], Number.MIN_VALUE);
  const hi = Math.max(domain[1], lo * 1.0001);
  const l0 = Math.log10(lo);
  const l1 = Math.log10(hi);
  const [r0, r1] = range;
  const k = (r1 - r0) / (l1 - l0);
  const s = ((v: number) => r0 + (Math.log10(Math.max(v, lo)) - l0) * k) as Scale;
  s.type = "log";
  s.domain = [lo, hi];
  s.range = range;
  s.invert = (px: number) => Math.pow(10, l0 + (px - r0) / k);
  s.ticks = (count = 5) => logTicks(lo, hi, count);
  return s;
}

/** Ticks for a log axis: powers of ten, adding 2× and 5× when the span is short. */
export function logTicks(min: number, max: number, count = 5): number[] {
  if (!(min > 0) || !(max > min)) return [min];
  const e0 = Math.floor(Math.log10(min));
  const e1 = Math.ceil(Math.log10(max));
  const decades = e1 - e0;
  const mult = decades <= 1 ? [1, 2, 3, 5] : decades <= Math.max(2, Math.floor(count / 2)) ? [1, 2, 5] : [1];
  const out: number[] = [];
  for (let e = e0; e <= e1; e++) {
    for (const m of mult) {
      const v = Number((m * Math.pow(10, e)).toPrecision(12));
      if (v >= min * 0.9999 && v <= max * 1.0001) out.push(v);
    }
  }
  if (out.length < 2) return [min, max];
  return out;
}

/** Log domain padded by a fraction of a decade on each side, snapped outward. */
export function logDomain(min: number, max: number, padDecades = 0.12): [number, number] {
  if (!(min > 0) || !(max > 0)) return [1e-6, 1];
  const l0 = Math.log10(Math.min(min, max)) - padDecades;
  const l1 = Math.log10(Math.max(min, max)) + padDecades;
  return [Math.pow(10, l0), Math.pow(10, l1 === l0 ? l0 + 1 : l1)];
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Finite min/max of the provided numbers (nulls ignored). */
export function extent(values: (number | null | undefined)[]): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo <= hi ? [lo, hi] : null;
}

/** Linear interpolation of y at x over points sorted by x (clamped at the ends). */
export function interpolateAt(points: { x: number; y: number }[], x: number, mode: "linear" | "step" = "linear"): number | null {
  if (!points.length) return null;
  if (x <= points[0].x) return mode === "step" ? (x < points[0].x ? 0 : points[0].y) : points[0].y;
  const last = points[points.length - 1];
  if (x >= last.x) return last.y;
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].x <= x) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  if (mode === "step") return a.y;
  const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
  return a.y + t * (b.y - a.y);
}
