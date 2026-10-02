/** Small descriptive statistics for client-side summaries (repeat runs). */

export interface Summary {
  n: number;
  mean: number | null;
  /** Sample standard deviation (n-1). Null when n < 2. */
  sd: number | null;
  min: number | null;
  max: number | null;
  median: number | null;
}

export function finite(values: Array<number | null | undefined>): number[] {
  return values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
}

export function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function sd(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values)!;
  return Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / (values.length - 1));
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function summarize(raw: Array<number | null | undefined>): Summary {
  const v = finite(raw);
  return {
    n: v.length,
    mean: mean(v),
    sd: sd(v),
    min: v.length ? Math.min(...v) : null,
    max: v.length ? Math.max(...v) : null,
    median: median(v),
  };
}
