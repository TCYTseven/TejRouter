"use client";

import Link from "next/link";
import { StatusDot } from "@/components/ui/badge";
import { useBrowserKeys } from "@/lib/client/keys";
import { getProviderSpec } from "@/lib/providers/registry";

/** "2 routers connected" line for the sidebar footer, counting keys saved in this browser. Links to the Routers page. */
export function RouterStatusPill({ configuredIds }: { live: number; total: number; simulators: number; configuredIds: string[] }) {
  const keys = useBrowserKeys();
  const ids = new Set(configuredIds);
  for (const [id, key] of Object.entries(keys)) {
    const spec = getProviderSpec(id);
    if (spec && !spec.simulated && (key.baseUrl || spec.baseUrl)) ids.add(id);
  }
  const live = ids.size;
  return (
    <Link href="/providers" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-fg-muted hover:bg-surface-2/60 hover:text-fg">
      <StatusDot status={live > 0 ? "ok" : "idle"} />
      {live === 0 ? "No routers connected" : `${live} router${live === 1 ? "" : "s"} connected`}
    </Link>
  );
}
