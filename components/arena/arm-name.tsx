import { ProviderDot } from "@/components/ui/provider";
import { cn } from "@/lib/client/cn";
import { armInfo } from "./arm-meta";

/** Router identity: registry dot (square = live router, ring = simulator), name and model. */
export function ArmName({
  armId,
  className,
  stacked,
  showModel = true,
}: {
  armId: string;
  className?: string;
  /** Put the model on its own line under the name. */
  stacked?: boolean;
  showModel?: boolean;
}) {
  const a = armInfo(armId);
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <ProviderDot color={a.color} simulated={a.simulated} size={9} />
      <span className={cn("min-w-0", stacked ? "flex flex-col" : "flex items-baseline gap-1.5")}>
        <span className="truncate font-medium text-fg">{a.name}</span>
        {showModel ? (
          <span className={cn("truncate font-mono text-[11px] text-fg-subtle", stacked && "leading-tight")}>
            {a.model ?? "default model"}
          </span>
        ) : null}
      </span>
    </span>
  );
}
