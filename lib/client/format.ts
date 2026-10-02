/**
 * Display formatters for metrics. Every function accepts null/undefined/NaN and
 * returns DASH so callers never have to branch on missing values.
 */

export const DASH = "—";

function bad(n: number | null | undefined): n is null | undefined {
  return n == null || !Number.isFinite(n);
}

/** 842 ms · 1.24 s · 1m 03s */
export function formatMs(ms: number | null | undefined): string {
  if (bad(ms)) return DASH;
  const a = Math.abs(ms);
  if (a === 0) return "0 ms";
  if (a < 1) return `${ms.toFixed(2)} ms`;
  if (a < 1000) return `${Math.round(ms)} ms`;
  if (a < 10_000) return `${(ms / 1000).toFixed(2)} s`;
  if (a < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(a / 60_000);
  const s = Math.round((a % 60_000) / 1000);
  return `${ms < 0 ? "-" : ""}${m}m ${String(s).padStart(2, "0")}s`;
}

/** 1,234 · 12.3K · 4.20M */
export function formatCompact(n: number | null | undefined, digits = 1): string {
  if (bad(n)) return DASH;
  const a = Math.abs(n);
  if (a < 10_000) return Math.round(n).toLocaleString("en-US");
  if (a < 1_000_000) return `${(n / 1000).toFixed(digits)}K`;
  if (a < 1_000_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  return `${(n / 1_000_000_000).toFixed(2)}B`;
}

/** Token counts: "1,234" (compacts above 10K). */
export function formatTokens(n: number | null | undefined): string {
  return formatCompact(n);
}

/** Grouped number with fixed decimals: 1,234.5 */
export function formatNumber(n: number | null | undefined, digits = 0): string {
  if (bad(n)) return DASH;
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/**
 * USD with precision that adapts to tiny per-call costs:
 * $12.40 · $0.0123 · $0.000042 · $0 (exactly zero)
 */
export function formatUsd(n: number | null | undefined): string {
  if (bad(n)) return DASH;
  if (n === 0) return "$0";
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 100) return `${sign}$${a.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (a >= 1) return `${sign}$${a.toFixed(2)}`;
  if (a >= 0.01) return `${sign}$${a.toFixed(4)}`;
  // three significant digits for micro-costs
  const digits = Math.min(10, Math.max(2, 2 - Math.floor(Math.log10(a))));
  return `${sign}$${a.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "")}`;
}

/** Fraction (0..1) to percent: 0.4231 -> "42.3%" */
export function formatPercent(fraction: number | null | undefined, digits = 1): string {
  if (bad(fraction)) return DASH;
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** Signed delta for percentages/fractions: +4.2 pp */
export function formatSigned(n: number | null | undefined, digits = 1, suffix = ""): string {
  if (bad(n)) return DASH;
  const s = n.toFixed(digits);
  return `${n > 0 ? "+" : ""}${s}${suffix}`;
}

/** Output throughput: "84.2 tok/s" */
export function formatTps(n: number | null | undefined): string {
  if (bad(n)) return DASH;
  return `${n >= 100 ? Math.round(n) : n.toFixed(1)} tok/s`;
}

/** "just now", "3m ago", "2h ago", "5d ago", then a date. */
export function formatRelativeTime(ts: number | null | undefined, now: number = Date.now()): string {
  if (bad(ts)) return DASH;
  const d = Math.max(0, now - ts);
  if (d < 45_000) return "just now";
  const minutes = Math.round(d / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(d / 3_600_000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(d / 86_400_000);
  if (days < 7) return `${days}d ago`;
  return formatDate(ts);
}

/** "Oct 2, 2026" */
export function formatDate(ts: number | null | undefined): string {
  if (bad(ts)) return DASH;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "Oct 2, 2026, 14:03" */
export function formatDateTime(ts: number | null | undefined): string {
  if (bad(ts)) return DASH;
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** mean ± sd formatted with the same formatter: "812 ms ± 40 ms" */
export function formatMeanSd(
  mean: number | null | undefined,
  sd: number | null | undefined,
  fmt: (n: number | null | undefined) => string,
): string {
  if (bad(mean)) return DASH;
  if (bad(sd)) return fmt(mean);
  return `${fmt(mean)} ± ${fmt(sd)}`;
}

/** Truncate long strings with an ellipsis. */
export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`;
}
