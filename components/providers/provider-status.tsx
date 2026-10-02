import type { ProviderStatus } from "@/lib/types";
import { Badge, StatusDot } from "@/components/ui/badge";
import { IconCheck, IconCpu, IconKey } from "@/components/ui/icons";

/** Status badge with icon + label (never color alone). */
export function ProviderStatusBadge({ provider }: { provider: ProviderStatus }) {
  if (provider.simulated)
    return (
      <Badge tone="info">
        <IconCpu size={11} />
        Offline simulator
      </Badge>
    );
  if (provider.configured)
    return (
      <Badge tone="success">
        <IconCheck size={11} />
        Configured
      </Badge>
    );
  const needsBase = !provider.effectiveBaseUrl;
  return (
    <Badge tone="warning">
      <IconKey size={11} />
      {needsBase && !provider.keySource ? "Needs key + URL" : needsBase ? "Needs base URL" : "Missing key"}
    </Badge>
  );
}

export function providerStatusKind(p: ProviderStatus) {
  return p.simulated ? "offline" : p.configured ? "ok" : "warn";
}

export function ProviderStatusDot({ provider, pulse }: { provider: ProviderStatus; pulse?: boolean }) {
  const kind = providerStatusKind(provider);
  return (
    <StatusDot
      status={kind}
      pulse={pulse && kind === "ok"}
      label={provider.simulated ? "Offline simulator" : provider.configured ? "Configured" : "Not configured"}
    />
  );
}

/** "…a3f1 via OPENROUTER_API_KEY" */
export function KeyHint({ provider }: { provider: ProviderStatus }) {
  if (provider.simulated) return <span className="text-fg-subtle">no key needed</span>;
  if (!provider.keyHint) return <span className="text-fg-subtle">not set</span>;
  return (
    <span>
      <span className="text-fg">…{provider.keyHint}</span>
      {provider.keySource ? <span className="text-fg-subtle"> via {provider.keySource}</span> : null}
    </span>
  );
}
