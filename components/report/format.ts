import { DASH, formatMs, formatUsd } from "@/lib/client/format";

/** 0.8019 -> "80.2%" */
export function pct(v: number | null | undefined, digits = 1): string {
  return v == null || !Number.isFinite(v) ? DASH : `${(v * 100).toFixed(digits)}%`;
}

/** Signed percentage points: 0.0312 -> "+3.1 pp" */
export function pp(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  const x = v * 100;
  const s = Math.abs(x) < 0.05 && digits <= 1 ? "0.0" : x.toFixed(digits);
  return `${x > 0 ? "+" : x < 0 ? "−" : ""}${s.replace("-", "")} pp`;
}

/** p-values: "< 0.001", "0.031", "0.41". */
export function pval(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return DASH;
  if (p < 0.001) return "< 0.001";
  if (p < 0.01) return p.toFixed(3);
  if (p > 0.995) return "1.00";
  return p.toFixed(p < 0.1 ? 3 : 2);
}

/** "p = 0.031" or "p < 0.001" */
export function pEq(p: number | null | undefined): string {
  const s = pval(p);
  return s.startsWith("<") ? `p ${s}` : `p = ${s}`;
}

/** Interval "[74.3, 85.4]" with a value formatter (no units repeated). */
export function ci(lo: number | null | undefined, hi: number | null | undefined, fmt: (v: number) => string): string {
  if (lo == null || hi == null || !Number.isFinite(lo) || !Number.isFinite(hi)) return "";
  return `[${fmt(lo)}, ${fmt(hi)}]`;
}

/** Bare percent number for intervals: 0.743 -> "74.3" */
export function pctNum(v: number, digits = 1): string {
  return (v * 100).toFixed(digits);
}

export function num(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function signed(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;
}

export function ms(v: number | null | undefined): string {
  return formatMs(v);
}

export function usd(v: number | null | undefined): string {
  return formatUsd(v);
}

/** Ratio "2.3×" */
export function times(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}×`;
}

export function levelPct(level: number): string {
  return `${Math.round(level * 100)}%`;
}

export { DASH };
