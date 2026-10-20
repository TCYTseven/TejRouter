import type { ProviderSpec } from "@/lib/types";
import { cn } from "@/lib/client/cn";

type ProviderLike = Pick<ProviderSpec, "id" | "name" | "color" | "logo"> & { simulated?: boolean };

/**
 * The provider's identity mark. Given a `provider`, it is the router's own logo
 * in a 16px box (or, for routers without one, its dot centred in that box), so
 * every router in a list lines up the same way. Given only a `color` (a benchmark
 * arm, which charts tell apart by shade), it is the small dot: a square for real
 * routers, a ring for simulators, so identity is never color alone.
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
  const dot = (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0", sim ? "rounded-full" : "rounded-[2px]", provider ? null : className)}
      style={{
        width: size,
        height: size,
        background: sim ? "transparent" : c,
        boxShadow: sim ? `inset 0 0 0 2px ${c}` : undefined,
      }}
    />
  );
  if (!provider) return dot;
  const box = Math.max(16, size);
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: box, height: box }}
    >
      {provider.logo ? (
        // A 64px PNG under /public; next/image would add nothing at this size.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={provider.logo}
          alt=""
          width={box}
          height={box}
          draggable={false}
          className="rounded-[4px] outline outline-1 -outline-offset-1 outline-fg/10"
        />
      ) : (
        dot
      )}
    </span>
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
