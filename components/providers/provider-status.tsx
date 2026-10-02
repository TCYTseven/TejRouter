import type { ProviderStatus } from "@/lib/types";
import { StatusDot } from "@/components/ui/badge";
import { cn } from "@/lib/client/cn";

export type RouterStatusTone = "ok" | "warn" | "practice";

/** Plain-words connection status for a router. */
export function routerStatus(p: ProviderStatus): { label: string; tone: RouterStatusTone } {
  if (p.simulated) return { label: "Practice router, no key needed", tone: "practice" };
  if (p.configured) return { label: "Connected", tone: "ok" };
  const needsUrl = !p.effectiveBaseUrl;
  if (needsUrl && !p.keySource) return { label: "Needs URL and key", tone: "warn" };
  if (needsUrl) return { label: "Needs URL", tone: "warn" };
  return { label: "Needs API key", tone: "warn" };
}

/** Status in words, with a small dot for scanning. */
export function RouterStatusText({ provider, className }: { provider: ProviderStatus; className?: string }) {
  const s = routerStatus(provider);
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm text-fg-muted", className)}>
      <StatusDot status={s.tone === "ok" ? "ok" : s.tone === "warn" ? "warn" : "idle"} />
      <span className={s.tone === "ok" ? "text-fg" : undefined}>{s.label}</span>
    </span>
  );
}

export function providerStatusKind(p: ProviderStatus) {
  return p.simulated ? "offline" : p.configured ? "ok" : "warn";
}

/** Used by the landing page. */
export function ProviderStatusDot({ provider, pulse }: { provider: ProviderStatus; pulse?: boolean }) {
  const kind = providerStatusKind(provider);
  return <StatusDot status={kind} pulse={pulse && kind === "ok"} label={routerStatus(provider).label} />;
}
