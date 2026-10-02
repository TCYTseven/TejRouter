import Link from "next/link";
import { StatusDot } from "@/components/ui/badge";

/** Compact "N routers live" readout for the sidebar footer. */
export function RouterStatusPill({ live, total, simulators }: { live: number; total: number; simulators: number }) {
  return (
    <Link
      href="/providers"
      className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-2 text-[11px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
    >
      <StatusDot status={live > 0 ? "ok" : "warn"} pulse={live > 0} />
      <span className="num flex-1">
        <span className="text-fg">{live}</span>/{total} routers live
      </span>
      <span className="num text-fg-subtle">+{simulators} sim</span>
    </Link>
  );
}
