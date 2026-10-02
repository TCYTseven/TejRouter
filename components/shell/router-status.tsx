import Link from "next/link";
import { StatusDot } from "@/components/ui/badge";

/** "2 routers connected" line for the sidebar footer. Links to the Routers page. */
export function RouterStatusPill({ live }: { live: number; total: number; simulators: number }) {
  return (
    <Link href="/providers" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-fg-muted hover:bg-surface-2/60 hover:text-fg">
      <StatusDot status={live > 0 ? "ok" : "idle"} />
      {live === 0 ? "No routers connected" : `${live} router${live === 1 ? "" : "s"} connected`}
    </Link>
  );
}
