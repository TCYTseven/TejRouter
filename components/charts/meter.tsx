import { cn } from "@/lib/client/cn";

/**
 * Linear meter (gauge) for a ratio against reference marks, e.g. "share of oracle
 * headroom captured". Supports negative values: the fill grows from `origin`
 * (default 0) toward the value. Tone is resolved by the caller and must be paired
 * with a text label when it carries status.
 */
export function Meter({
  value,
  min = 0,
  max = 1,
  origin = 0,
  marks = [],
  tone = "accent",
  ariaLabel,
  valueText,
  height = 8,
  className,
}: {
  value: number | null;
  min?: number;
  max?: number;
  origin?: number;
  marks?: { value: number; label: string }[];
  tone?: "accent" | "danger" | "neutral";
  ariaLabel: string;
  valueText: string;
  height?: number;
  className?: string;
}) {
  const pos = (v: number) => ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100;
  const v = value;
  const left = v == null ? 0 : Math.min(pos(origin), pos(v));
  const right = v == null ? 0 : Math.max(pos(origin), pos(v));
  const fill = tone === "danger" ? "var(--danger)" : tone === "neutral" ? "var(--fg-subtle)" : "var(--accent)";
  const track = tone === "danger" ? "var(--danger-soft)" : tone === "neutral" ? "var(--surface-3)" : "var(--accent-soft)";
  return (
    <div className={cn("w-full", className)}>
      <div
        role="meter"
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={v ?? undefined}
        aria-valuetext={valueText}
        className="relative w-full rounded-full"
        style={{ height, background: track }}
      >
        {v != null ? (
          <div className="absolute inset-y-0 rounded-full" style={{ left: `${left}%`, width: `${Math.max(0.8, right - left)}%`, background: fill }} />
        ) : null}
        {marks.map((m) => (
          <span key={m.label} aria-hidden="true" className="absolute -top-1 -bottom-1 w-px bg-fg-subtle" style={{ left: `${pos(m.value)}%` }} />
        ))}
      </div>
      {marks.length ? (
        <div className="relative mt-1.5 h-5 text-[13px] text-fg-muted" aria-hidden="true">
          {marks.map((m) => {
            const p = pos(m.value);
            return (
              <span
                key={m.label}
                className="absolute whitespace-nowrap"
                style={{ left: `${p}%`, transform: p > 85 ? "translateX(-100%)" : p < 15 ? "none" : "translateX(-50%)" }}
              >
                {m.label}
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
