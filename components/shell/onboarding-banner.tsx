"use client";

import { ButtonLink } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Disclosure } from "@/components/ui/disclosure";
import { IconArrowRight, IconFlask, IconX } from "@/components/ui/icons";
import { useHydrated, useOnboarding } from "@/lib/client/onboarding";
import { cn } from "@/lib/client/cn";

/**
 * First-run banner shown while no real router key is configured. Dismissal is
 * persisted in localStorage; it never renders during SSR so returning users who
 * dismissed it never see a flash.
 */
export function OnboardingBanner({
  realConfigured,
  envTemplate,
  className,
}: {
  realConfigured: number;
  envTemplate: string;
  className?: string;
}) {
  const hydrated = useHydrated();
  const [state, update] = useOnboarding();
  if (!hydrated || realConfigured > 0 || state.dismissed || state.completed) return null;

  return (
    <section
      aria-labelledby="onboarding-banner-title"
      className={cn(
        "relative mb-6 animate-rise overflow-hidden rounded-lg border border-accent-line bg-surface",
        className,
      )}
    >
      <div aria-hidden="true" className="bg-dots pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-accent-line bg-accent-soft text-accent-text">
          <IconFlask size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="onboarding-banner-title" className="text-sm font-semibold text-fg">
            You&apos;re running on simulators
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">
            Everything works offline with two simulated routers. To race real routers, add their keys to{" "}
            <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[11px] text-fg">.env.local</code> and restart{" "}
            <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[11px] text-fg">npm run dev</code>. No account needed.
          </p>
          <Disclosure summary="Show the .env.local template" className="mt-2">
            <div className="relative">
              <pre className="max-h-56 overflow-auto rounded-md border border-border bg-bg-subtle p-3 font-mono text-[11px] leading-relaxed text-fg-muted">
                {envTemplate}
              </pre>
              <CopyButton text={envTemplate} label="Copy" toastTitle=".env.local template copied" className="absolute top-1.5 right-1.5" variant="secondary" size="xs" />
            </div>
          </Disclosure>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
          <ButtonLink href="/onboarding" variant="accent" size="sm" rightIcon={<IconArrowRight size={13} />}>
            Setup guide
          </ButtonLink>
        </div>
        <button
          type="button"
          onClick={() => update({ dismissed: true })}
          className="absolute top-2 right-2 rounded p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg sm:static sm:self-start"
          aria-label="Dismiss the simulator banner"
        >
          <IconX size={14} />
        </button>
      </div>
    </section>
  );
}
