"use client";

import { useEffect, useId } from "react";
import type { ProviderStatus } from "@/lib/types";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  IconArrowRight,
  IconCheck,
  IconCheckCircle,
  IconFlask,
  IconRefresh,
  IconServer,
  IconTerminal,
} from "@/components/ui/icons";
import { ProviderDot } from "@/components/ui/provider";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/client/cn";
import { buildEnvTemplate } from "@/lib/client/env-template";
import { useHydrated, useOnboarding } from "@/lib/client/onboarding";
import { useProviders } from "@/lib/client/providers";

const STEPS = [
  { title: "Choose your routers", short: "Routers" },
  { title: "Restart and re-check", short: "Re-check" },
  { title: "Try it", short: "Try it" },
];

export function OnboardingFlow({ initial }: { initial: ProviderStatus[] }) {
  const { providers: live, reload, refreshing, error } = useProviders(initial);
  const providers = live ?? initial;
  const real = providers.filter((p) => !p.simulated);
  const [state, update] = useOnboarding();
  const hydrated = useHydrated();
  const toast = useToast();
  const ids = useId();

  // Remember which routers were configured when the guide started.
  useEffect(() => {
    if (hydrated && state.baseline === null) {
      update({ baseline: initial.filter((p) => p.configured && !p.simulated).map((p) => p.id) });
    }
  }, [hydrated, state.baseline, initial, update]);

  const step = Math.min(Math.max(0, state.step), STEPS.length - 1);
  const selected = new Set(state.selected);
  const chosen = real.filter((p) => selected.has(p.id));
  const snippet = buildEnvTemplate(chosen);
  const goto = (n: number) => update({ step: n });
  const skip = () => update({ step: Math.min(step + 1, STEPS.length - 1), skipped: Array.from(new Set([...state.skipped, step])) });
  const toggle = (id: string) =>
    update({ selected: selected.has(id) ? state.selected.filter((x) => x !== id) : [...state.selected, id] });

  const recheck = async () => {
    reload();
    toast({ title: "Re-checking routers…", duration: 1500 });
  };

  const watch = chosen.length ? chosen : real;
  const nowLive = watch.filter((p) => p.configured);

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      {/* Stepper */}
      <nav aria-label="Setup steps">
        <ol className="flex gap-2 overflow-x-auto lg:flex-col">
          {STEPS.map((s, i) => {
            const done = i < step || (i === step && state.completed);
            const current = i === step;
            return (
              <li key={s.title} className="shrink-0">
                <button
                  type="button"
                  onClick={() => goto(i)}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left text-xs transition-colors",
                    current ? "border-accent-line bg-accent-soft text-fg" : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg",
                  )}
                >
                  <span
                    className={cn(
                      "num flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                      done ? "border-success bg-success text-fg-inverse" : current ? "border-accent text-accent-text" : "border-border-strong",
                    )}
                  >
                    {done ? <IconCheck size={11} strokeWidth={2.5} /> : i + 1}
                  </span>
                  <span className="font-medium">
                    <span className="lg:hidden">{s.short}</span>
                    <span className="hidden lg:inline">{s.title}</span>
                  </span>
                  {state.skipped.includes(i) && !done ? <span className="ml-auto text-[10px] text-fg-subtle">skipped</span> : null}
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 hidden text-[11px] leading-relaxed text-fg-subtle lg:block">
          No account, no sign-up. Keys live in <code className="font-mono">.env.local</code> on your machine and progress is saved in this browser.
        </p>
      </nav>

      <section aria-labelledby={`${ids}-title`} className="min-w-0 rounded-lg border border-border bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
          <div>
            <p className="eyebrow">
              Step {step + 1} of {STEPS.length}
            </p>
            <h2 id={`${ids}-title`} className="mt-0.5 text-base font-semibold tracking-tight text-fg">
              {step === 0 ? "Which routers do you use?" : step === 1 ? "Restart npm run dev and re-check" : "Try it"}
            </h2>
          </div>
          {step < STEPS.length - 1 ? (
            <Button size="sm" variant="ghost" onClick={skip}>
              Skip this step
            </Button>
          ) : null}
        </header>

        <div className="p-5">
          {step === 0 ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-fg-muted">
                Select the routers you have keys for. TejRouter shows the exact variables to add; the simulators always work without any.
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {real.map((p) => {
                  const on = selected.has(p.id);
                  return (
                    <li key={p.id}>
                      <label
                        className={cn(
                          "flex h-full cursor-pointer gap-3 rounded-lg border p-3 transition-colors",
                          on ? "border-accent-line bg-accent-soft" : "border-border bg-surface-2 hover:border-border-strong",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(p.id)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 text-sm font-medium text-fg">
                              <ProviderDot provider={p} />
                              {p.name}
                            </span>
                            {p.configured ? (
                              <Badge tone="success">
                                <IconCheck size={10} /> live
                              </Badge>
                            ) : (
                              <Badge tone="outline">missing</Badge>
                            )}
                          </span>
                          <span className="mt-1 block text-[11px] text-fg-muted">{p.tagline}</span>
                          <span className="mt-1.5 block font-mono text-[11px] text-fg-subtle">
                            {p.configured ? `using ${p.keySource}` : `add ${p.keyEnvs[0]}`}
                            {!p.baseUrl ? ` + ${p.baseUrlEnv}` : ""}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="rounded-lg border border-border bg-bg-subtle">
                <div className="flex h-9 items-center justify-between border-b border-border px-3">
                  <span className="font-mono text-[11px] text-fg-subtle">
                    .env.local {chosen.length ? `· ${chosen.length} router${chosen.length > 1 ? "s" : ""}` : ""}
                  </span>
                  <CopyButton text={chosen.length ? snippet : buildEnvTemplate(real)} label={chosen.length ? "Copy snippet" : "Copy all routers"} toastTitle="Snippet copied" size="xs" variant="secondary" />
                </div>
                <pre className="max-h-64 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-fg-muted">
                  {chosen.length ? snippet : "# Select routers above to generate a snippet for just those."}
                </pre>
              </div>
              <div className="flex justify-end">
                <Button variant="accent" onClick={() => goto(1)} rightIcon={<IconArrowRight size={13} />}>
                  I&apos;ve added my keys
                </Button>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="flex flex-col gap-4">
              <ol className="flex flex-col gap-2 text-sm text-fg-muted">
                <li className="flex gap-2">
                  <span className="num text-fg-subtle">1.</span>
                  <span>
                    Paste the snippet into <code className="font-mono text-fg">.env.local</code> at the project root and fill in the values.
                  </span>
                </li>
                <li className="flex flex-wrap items-center gap-2">
                  <span className="num text-fg-subtle">2.</span>
                  <span>Restart the dev server so Next.js reloads the environment:</span>
                  <span className="flex items-center gap-1 rounded-md border border-border bg-bg-subtle py-0.5 pr-0.5 pl-2 font-mono text-xs text-fg">
                    npm run dev
                    <CopyButton text="npm run dev" iconOnly label="Copy command" size="xs" toastTitle="Command copied" />
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="num text-fg-subtle">3.</span>
                  <span>Re-check below. Newly configured routers get a green tick.</span>
                </li>
              </ol>
              <div className="flex items-center gap-3">
                <Button variant="accent" onClick={recheck} loading={refreshing} leftIcon={<IconRefresh size={13} />}>
                  Re-check routers
                </Button>
                <span className="num text-xs text-fg-muted" aria-live="polite">
                  {nowLive.length} of {watch.length} {chosen.length ? "selected " : ""}routers live
                </span>
              </div>
              {error ? <p className="text-xs text-danger">Could not reach /api/providers: {error}</p> : null}
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border" aria-live="polite">
                {watch.map((p) => {
                  const isNew = p.configured && state.baseline !== null && !state.baseline.includes(p.id);
                  return (
                    <li key={p.id} className="flex items-center gap-3 bg-surface-2 px-3 py-2.5">
                      {p.configured ? (
                        <IconCheckCircle size={16} className="shrink-0 text-success" title="Configured" />
                      ) : (
                        <StatusDot status="warn" className="mx-1" label="Not configured" />
                      )}
                      <ProviderDot provider={p} />
                      <span className="flex-1 truncate text-sm text-fg">{p.name}</span>
                      {isNew ? <Badge tone="success">new</Badge> : null}
                      <span className="num truncate text-[11px] text-fg-subtle">
                        {p.configured ? `…${p.keyHint ?? ""} via ${p.keySource}` : `waiting for ${p.keyEnvs[0]}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => goto(0)}>
                  Back
                </Button>
                <Button variant="accent" onClick={() => goto(2)} rightIcon={<IconArrowRight size={13} />}>
                  Continue
                </Button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-fg-muted">
                {nowLive.length
                  ? `You have ${nowLive.length} live router${nowLive.length > 1 ? "s" : ""}. Put them head to head.`
                  : "No real routers yet? The two offline simulators let you try every feature right now."}
              </p>
              <ul className="grid gap-3 md:grid-cols-3">
                {[
                  { href: "/playground", icon: IconTerminal, title: "Race a prompt", body: "One prompt, every router, streamed side by side." },
                  { href: "/benchmarks", icon: IconFlask, title: "Run a quick benchmark", body: "A graded suite with confidence intervals." },
                  { href: "/providers", icon: IconServer, title: "Health-check routers", body: "Ping each router and inspect routing headers." },
                ].map((c) => (
                  <li key={c.href}>
                    <a
                      href={c.href}
                      onClick={() => update({ completed: true })}
                      className="group flex h-full flex-col gap-2 rounded-lg border border-border bg-surface-2 p-4 transition-colors hover:border-accent-line"
                    >
                      <c.icon size={18} className="text-accent-text" />
                      <span className="text-sm font-semibold text-fg">{c.title}</span>
                      <span className="text-xs text-fg-muted">{c.body}</span>
                      <span className="mt-auto flex items-center gap-1 text-xs font-medium text-accent-text">
                        Go <IconArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button variant="ghost" onClick={() => goto(1)}>
                  Back
                </Button>
                {state.completed ? (
                  <span className="flex items-center gap-1.5 text-xs text-success">
                    <IconCheckCircle size={14} /> Setup complete
                  </span>
                ) : (
                  <ButtonLink href="/dashboard" variant="accent" onClick={() => update({ completed: true })}>
                    Finish setup
                  </ButtonLink>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
