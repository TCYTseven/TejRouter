import type { ProviderStatus } from "@/lib/types";
import { CopyButton } from "@/components/ui/copy-button";
import { IconAlert } from "@/components/ui/icons";
import { ProviderDot } from "@/components/ui/provider";
import { buildEnvTemplate } from "@/lib/client/env-template";

/** Setup section: every env var each router reads + a copyable template. */
export function EnvSetup({ providers }: { providers: ProviderStatus[] }) {
  const real = providers.filter((p) => !p.simulated);
  const template = buildEnvTemplate(providers);
  return (
    <div className="grid gap-4 2xl:grid-cols-[1.1fr_1fr]">
      <div className="min-w-0 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[520px] text-left text-xs">
          <caption className="sr-only">Environment variables read by each router</caption>
          <thead className="bg-surface-2 text-[11px] text-fg-subtle">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Router</th>
              <th scope="col" className="px-3 py-2 font-medium">API key (first match wins)</th>
              <th scope="col" className="px-3 py-2 font-medium">Base URL</th>
              <th scope="col" className="px-3 py-2 font-medium">Model</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {real.map((p) => (
              <tr key={p.id} className="align-top">
                <th scope="row" className="px-3 py-2 font-medium whitespace-nowrap text-fg">
                  <span className="flex items-center gap-2">
                    <ProviderDot provider={p} />
                    {p.name}
                  </span>
                </th>
                <td className="px-3 py-2 font-mono text-[11px] text-fg-muted">
                  {p.keyEnvs.map((k) => (
                    <div key={k} className={k === p.keySource ? "text-success" : undefined}>
                      {k}
                      {k === p.keySource ? " ✓" : ""}
                    </div>
                  ))}
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-fg-muted">
                  {p.baseUrlEnv}
                  {!p.baseUrl ? <div className="font-sans text-[10px] text-warning">required</div> : null}
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-fg-muted">{p.modelEnv}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="relative min-w-0 rounded-lg border border-border bg-bg-subtle">
          <div className="flex h-9 items-center justify-between border-b border-border px-3">
            <span className="font-mono text-[11px] text-fg-subtle">.env.local</span>
            <CopyButton text={template} label="Copy template" toastTitle=".env.local template copied" size="xs" variant="secondary" />
          </div>
          <pre className="max-h-80 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-fg-muted">{template}</pre>
        </div>
        <p className="flex gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-[11px] leading-relaxed text-fg-muted">
          <IconAlert size={13} className="mt-0.5 shrink-0 text-warning" />
          <span>
            <strong className="font-medium text-fg">FastLLM is self-hosted.</strong> It has no public endpoint, so set{" "}
            <code className="font-mono text-fg">FASTLLM_BASE_URL</code> to your deployment&apos;s <code className="font-mono">/v1</code> URL (and{" "}
            <code className="font-mono text-fg">FASTLLM_MODEL</code> to a frontend model). Restart <code className="font-mono">npm run dev</code> after editing{" "}
            <code className="font-mono">.env.local</code>.
          </span>
        </p>
      </div>
    </div>
  );
}
