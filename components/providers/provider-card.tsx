import type { ProviderStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { IconExternal, IconInfo } from "@/components/ui/icons";
import { ProviderDot } from "@/components/ui/provider";
import { providerEnvVars } from "@/lib/client/env-template";
import { HealthCheck } from "./health-check";
import { ModelList } from "./model-list";
import { KeyHint, ProviderStatusBadge } from "./provider-status";

/** Full provider card for /providers. Server component with client islands. */
export function ProviderCard({ provider: p }: { provider: ProviderStatus }) {
  const vars = providerEnvVars(p);
  return (
    <Card as="article" id={p.id} aria-labelledby={`${p.id}-title`} className="flex scroll-mt-20 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-1">
            <ProviderDot provider={p} size={12} />
          </span>
          <div className="min-w-0">
            <h2 id={`${p.id}-title`} className="text-[15px] font-semibold tracking-tight text-fg">
              {p.name}
            </h2>
            <p className="mt-0.5 text-xs text-fg-muted">{p.tagline}</p>
          </div>
        </div>
        <ProviderStatusBadge provider={p} />
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-fg-subtle">Key</dt>
          <dd className="num min-w-0 truncate text-fg-muted">
            <KeyHint provider={p} />
          </dd>
          <dt className="text-fg-subtle">Base URL</dt>
          <dd className="num min-w-0 break-all text-fg-muted">
            {p.effectiveBaseUrl || <span className="text-warning">not set: add {p.baseUrlEnv}</span>}
          </dd>
          <dt className="text-fg-subtle">Default model</dt>
          <dd className="num min-w-0 break-all text-fg-muted">{p.defaultModel || <span className="text-fg-subtle">none (set {p.modelEnv})</span>}</dd>
          {p.autoModel ? (
            <>
              <dt className="text-fg-subtle">Auto model</dt>
              <dd className="num min-w-0 break-all text-fg-muted">{p.autoModel}</dd>
            </>
          ) : null}
          {p.docsUrl ? (
            <>
              <dt className="text-fg-subtle">Docs</dt>
              <dd className="min-w-0 truncate">
                <a href={p.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-text hover:underline">
                  {p.docsUrl.replace(/^https?:\/\//, "")}
                  <IconExternal size={11} />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </dd>
            </>
          ) : null}
        </dl>

        {p.notes ? (
          <p className="flex gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-2 text-[11px] leading-relaxed text-fg-muted">
            <IconInfo size={13} className="mt-0.5 shrink-0 text-info" />
            {p.notes}
          </p>
        ) : null}

        {vars.length ? (
          <div>
            <h3 className="eyebrow mb-1.5">Environment variables</h3>
            <ul className="flex flex-wrap gap-1.5">
              {vars.map((v) => (
                <li key={v.name}>
                  <Badge
                    mono
                    tone={v.name === p.keySource ? "success" : "outline"}
                    title={v.role === "key" ? "API key" : v.role === "key-alias" ? "API key (alias)" : v.role === "base-url" ? "Base URL override" : "Default model override"}
                  >
                    {v.name}
                    <span className="font-sans text-[10px] opacity-70">
                      {v.role === "key" ? "key" : v.role === "key-alias" ? "alias" : v.role === "base-url" ? "url" : "model"}
                    </span>
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <h3 className="eyebrow mb-1.5">Models</h3>
          <ModelList providerId={p.id} suggested={p.suggestedModels} />
        </div>

        <div className="mt-auto border-t border-border pt-3">
          <HealthCheck providerId={p.id} disabledReason={!p.configured ? "Not configured: the call will report the missing key" : undefined} />
        </div>
      </div>
    </Card>
  );
}
