import Link from "next/link";
import type { ProviderStatus } from "@/lib/types";
import { ProviderDot } from "@/components/ui/provider";
import { IconArrowUpRight } from "@/components/ui/icons";
import { KeyHint, ProviderStatusBadge } from "./provider-status";
import { cn } from "@/lib/client/cn";

/** Dense grid of provider tiles for the dashboard and landing page. */
export function ProviderStatusGrid({ providers, className }: { providers: ProviderStatus[]; className?: string }) {
  const ordered = [...providers].sort((a, b) => rank(a) - rank(b));
  return (
    <ul className={cn("grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 xl:grid-cols-3", className)}>
      {ordered.map((p) => (
        <li key={p.id} className="bg-surface">
          <Link
            href={`/providers#${p.id}`}
            className="group flex h-full flex-col gap-2.5 p-3.5 transition-colors hover:bg-surface-2 focus-visible:-outline-offset-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <ProviderDot provider={p} size={10} />
                <span className="truncate text-sm font-medium text-fg">{p.name}</span>
              </span>
              <ProviderStatusBadge provider={p} />
            </div>
            <dl className="grid grid-cols-[72px_1fr] gap-x-2 gap-y-1 text-[11px]">
              <dt className="text-fg-subtle">Key</dt>
              <dd className="num truncate text-fg-muted">
                <KeyHint provider={p} />
              </dd>
              <dt className="text-fg-subtle">Base URL</dt>
              <dd className="num truncate text-fg-muted" title={p.effectiveBaseUrl || undefined}>
                {p.effectiveBaseUrl || <span className="text-warning">not set ({p.baseUrlEnv})</span>}
              </dd>
              <dt className="text-fg-subtle">Model</dt>
              <dd className="num truncate text-fg-muted" title={p.defaultModel || undefined}>
                {p.defaultModel || <span className="text-fg-subtle">set {p.modelEnv}</span>}
              </dd>
            </dl>
            <span className="mt-auto flex items-center gap-1 text-[11px] text-fg-subtle group-hover:text-fg-muted">
              Details <IconArrowUpRight size={11} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function rank(p: ProviderStatus) {
  if (p.configured && !p.simulated) return 0;
  if (!p.simulated) return 1;
  return 2;
}
