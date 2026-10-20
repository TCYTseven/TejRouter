"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { ProviderStatus } from "@/lib/types";
import { Button, ButtonLink } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { ProviderDot } from "@/components/ui/provider";
import { RouterStatusText } from "@/components/providers/provider-status";
import { RouterRow } from "@/components/providers/router-row";
import { buildEnvTemplate } from "@/lib/client/env-template";
import { useOnboarding } from "@/lib/client/onboarding";
import { useWithBrowserKeys } from "@/lib/client/keys";
import { useProviders } from "@/lib/client/providers";

function Step({ n, title, description, children }: { n: number; title: string; description: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`step-${n}`} className="flex flex-col gap-4">
      <div>
        <h2 id={`step-${n}`} className="text-lg font-semibold text-fg">
          {n}. {title}
        </h2>
        <p className="mt-1 text-[15px] text-fg-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

/** Pick routers, copy the snippet and restart, then test. All on one page. */
export function OnboardingFlow({ initial }: { initial: ProviderStatus[] }) {
  const { providers: live, reload, refreshing, error } = useProviders(initial);
  const providers = useWithBrowserKeys(live ?? initial);
  const real = providers.filter((p) => !p.simulated);
  const practice = providers.filter((p) => p.simulated);
  const [state, update] = useOnboarding();

  const selected = new Set(state.selected);
  const chosen = real.filter((p) => selected.has(p.id));
  const toggle = (id: string) =>
    update({ selected: selected.has(id) ? state.selected.filter((x) => x !== id) : [...state.selected, id] });
  const snippet = buildEnvTemplate(chosen);
  const testList = chosen.length ? chosen : practice;
  const connected = chosen.filter((p) => p.configured).length;

  return (
    <div className="flex flex-col gap-10">
      <Step n={1} title="Pick the routers you use" description="Choose the ones you have an API key for. You can change this later.">
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {real.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-start gap-3 px-5 py-4 hover:bg-surface-2/50 max-sm:px-4">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--fg)]"
                />
                <ProviderDot provider={p} size={10} className="mt-1" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-fg">{p.name}</span>
                  <span className="block text-sm text-fg-muted">{p.tagline}</span>
                  <RouterStatusText provider={p} className="mt-1 sm:hidden" />
                </span>
                <RouterStatusText provider={p} className="shrink-0 max-sm:hidden" />
              </label>
            </li>
          ))}
        </ul>
      </Step>

      <Step
        n={2}
        title="Add your keys and restart"
        description={
          <>
            Paste this into <code className="font-mono text-sm text-fg">.env.local</code> at the project root, fill in your keys,
            then stop and start <code className="font-mono text-sm text-fg">npm run dev</code> again. Or add them in{" "}
            <Link href="/settings" className="text-link hover:underline">
              Settings
            </Link>
            , where they stay in this browser and need no restart.
          </>
        }
      >
        {chosen.length ? (
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
              <span className="text-sm text-fg-muted">
                For {chosen.length} {chosen.length === 1 ? "router" : "routers"}
              </span>
              <CopyButton text={snippet} label="Copy" toastTitle="Copied. Paste it into .env.local" size="sm" />
            </div>
            <pre className="max-h-72 overflow-auto p-4 font-mono text-[13px] leading-relaxed text-fg-muted">{snippet}</pre>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border-strong px-5 py-6 text-center text-sm text-fg-muted">
            Pick at least one router above and its lines will appear here.
          </p>
        )}
      </Step>

      <Step
        n={3}
        title="Test it"
        description={
          chosen.length
            ? "After restarting, check again and press Test on each router."
            : "No keys yet? The practice routers work right away. Press Test to see one answer."
        }
      >
        {chosen.length ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" onClick={reload} loading={refreshing}>
              Check again
            </Button>
            <span className="text-sm text-fg-muted" aria-live="polite">
              {connected} of {chosen.length} connected
            </span>
          </div>
        ) : null}
        {error ? <p className="text-sm text-danger">Could not check the routers ({error}). Is the app still running?</p> : null}
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {testList.map((p) => (
            <RouterRow key={p.id} provider={p} expandable={false} />
          ))}
        </ul>
        <div>
          <ButtonLink href="/playground" variant="primary" onClick={() => update({ completed: true })}>
            Go to Compare
          </ButtonLink>
        </div>
      </Step>
    </div>
  );
}
