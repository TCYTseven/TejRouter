import type { ProviderSpec } from "@/lib/types";
import { cn } from "@/lib/client/cn";

type ProviderLike = Pick<ProviderSpec, "id" | "name" | "color"> & { simulated?: boolean };

/**
 * The provider's identity mark: a small square in its registry color.
 * Shape (square for real routers, ring for simulators) is a secondary
 * encoding so identity is never color alone.
 */
export function ProviderDot({
  provider,
  color,
  simulated,
  size = 8,
  className,
}: {
  provider?: ProviderLike;
  color?: string;
  simulated?: boolean;
  size?: number;
  className?: string;
}) {
  const c = color ?? provider?.color ?? "var(--fg-subtle)";
  const sim = simulated ?? provider?.simulated;
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0", sim ? "rounded-full" : "rounded-[2px]", className)}
      style={{
        width: size,
        height: size,
        background: sim ? "transparent" : c,
        boxShadow: sim ? `inset 0 0 0 2px ${c}` : undefined,
      }}
    />
  );
}

/** Dot + name chip. `model` appends a mono model id. */
export function ProviderBadge({
  provider,
  model,
  className,
  size = "sm",
}: {
  provider: ProviderLike;
  model?: string | null;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border border-border bg-surface-2 font-medium text-fg",
        size === "sm" ? "h-7 px-2.5 text-[13px]" : "h-8 px-3 text-sm",
        className,
      )}
    >
      <ProviderDot provider={provider} />
      <span className="truncate">{provider.name}</span>
      {model ? <span className="truncate text-[13px] font-normal text-fg-muted">{model}</span> : null}
    </span>
  );
}
