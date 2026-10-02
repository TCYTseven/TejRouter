import { cn } from "@/lib/client/cn";

/**
 * One prompt fans out to several routers and comes back as measurements.
 * Pure HTML/CSS + an SVG connector layer laid out on a fixed percentage grid,
 * so it scales from phone to desktop without tiny text. Motion is CSS only
 * and disabled under prefers-reduced-motion.
 */
const ROUTERS = [
  { name: "Ramp", color: "#3b82f6", w: 62 },
  { name: "Enclave", color: "#f97316", w: 48 },
  { name: "OpenRouter", color: "#a855f7", w: 80 },
  { name: "Requesty", color: "#10b981", w: 55 },
  { name: "Martian", color: "#ec4899", w: 70 },
];

// Column geometry in % of the container width (must match the grid template).
const PROMPT_RIGHT = 31;
const ROUTER_LEFT = 41;
const ROUTER_RIGHT = 69;
const METRIC_LEFT = 76;

export function HeroVisual({ className }: { className?: string }) {
  const n = ROUTERS.length;
  const y = (i: number) => ((i + 0.5) / n) * 100;
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-surface/80 p-3 shadow-lg backdrop-blur-sm sm:p-5",
        className,
      )}
      role="img"
      aria-label="Diagram: one prompt is sent to five routers in parallel; each response comes back with latency, cost and the model it chose."
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-danger/70" />
          <span className="h-2 w-2 rounded-full bg-warning/70" />
          <span className="h-2 w-2 rounded-full bg-success/70" />
        </span>
        <span className="font-mono text-[10px] text-fg-subtle">tejrouter · race</span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-accent-text">
          <span className="h-1.5 w-1.5 rounded-full bg-accent motion-safe:animate-pulse-dot" />
          live
        </span>
      </div>

      <div className="relative h-[230px] sm:h-[280px]">
        {/* connectors */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {ROUTERS.map((r, i) => (
            <g key={r.name}>
              <path
                d={`M${PROMPT_RIGHT} 50 C ${(PROMPT_RIGHT + ROUTER_LEFT) / 2} 50, ${(PROMPT_RIGHT + ROUTER_LEFT) / 2} ${y(i)}, ${ROUTER_LEFT} ${y(i)}`}
                fill="none"
                stroke="var(--border-strong)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={`M${PROMPT_RIGHT} 50 C ${(PROMPT_RIGHT + ROUTER_LEFT) / 2} 50, ${(PROMPT_RIGHT + ROUTER_LEFT) / 2} ${y(i)}, ${ROUTER_LEFT} ${y(i)}`}
                fill="none"
                stroke={r.color}
                strokeWidth="1.5"
                strokeDasharray="3 9"
                vectorEffect="non-scaling-stroke"
                className="motion-safe:[animation:dash-flow_1.1s_linear_infinite]"
                style={{ animationDelay: `${i * -0.2}s` }}
              />
              <path
                d={`M${ROUTER_RIGHT} ${y(i)} L ${METRIC_LEFT} ${y(i)}`}
                fill="none"
                stroke={r.color}
                strokeOpacity="0.7"
                strokeWidth="1.5"
                strokeDasharray="2 6"
                vectorEffect="non-scaling-stroke"
                className="motion-safe:[animation:dash-flow_1.4s_linear_infinite]"
              />
            </g>
          ))}
        </svg>

        {/* prompt */}
        <div className="absolute top-1/2 left-0 -translate-y-1/2" style={{ width: `${PROMPT_RIGHT}%` }}>
          <div className="rounded-lg border border-border-strong bg-surface-2 p-2 shadow-sm sm:p-3">
            <div className="eyebrow mb-1 text-[9px] sm:text-[10px]">prompt</div>
            <p className="font-mono text-[10px] leading-snug text-fg sm:text-xs">
              <span className="text-accent-text">›</span> Explain mutex vs semaphore
              <span aria-hidden="true" className="ml-0.5 inline-block h-3 w-1 translate-y-0.5 bg-accent motion-safe:animate-caret" />
            </p>
          </div>
        </div>

        {/* routers */}
        <ul className="absolute inset-y-0 flex flex-col justify-around" style={{ left: `${ROUTER_LEFT}%`, width: `${ROUTER_RIGHT - ROUTER_LEFT}%` }}>
          {ROUTERS.map((r, i) => (
            <li
              key={r.name}
              className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-1.5 shadow-sm sm:h-9 sm:gap-2 sm:px-2.5"
            >
              <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: r.color }} />
              <span className="truncate text-[10px] font-medium text-fg sm:text-xs">{r.name}</span>
              <span
                className="ml-auto hidden h-1.5 w-1.5 shrink-0 rounded-full bg-success opacity-0 sm:block motion-safe:[animation:fade-in_300ms_ease-out_both]"
                style={{ animationDelay: `${0.9 + i * 0.25}s` }}
              />
            </li>
          ))}
        </ul>

        {/* measurements */}
        <ul className="absolute inset-y-0 right-0 flex flex-col justify-around" style={{ left: `${METRIC_LEFT}%` }}>
          {ROUTERS.map((r, i) => (
            <li key={r.name} className="flex h-8 flex-col justify-center gap-1 sm:h-9">
              <div className="h-1.5 w-full overflow-hidden rounded-r-[3px] bg-surface-3">
                <div
                  className="h-full origin-left rounded-r-[3px] motion-safe:[animation:bar-grow_2.8s_cubic-bezier(.2,.8,.2,1)_infinite_alternate]"
                  style={{ width: `${r.w}%`, background: r.color, animationDelay: `${i * 0.18}s` }}
                />
              </div>
              <div className="h-1 w-3/5 rounded bg-surface-3" />
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 font-mono text-[10px] text-fg-subtle sm:text-[11px]">
        <span>
          <span className="text-fg">TTFT</span> · latency
        </span>
        <span className="text-center">
          <span className="text-fg">cost</span> · tokens
        </span>
        <span className="text-right">
          <span className="text-fg">served model</span>
        </span>
      </div>
    </div>
  );
}
