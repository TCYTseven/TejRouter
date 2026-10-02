"use client";

import { ButtonLink } from "@/components/ui/button";
import { IconX } from "@/components/ui/icons";
import { useHydrated, useOnboarding } from "@/lib/client/onboarding";
import { cn } from "@/lib/client/cn";

/**
 * First-run banner shown while no real router key is configured. Dismissal is
 * persisted in localStorage; it never renders during SSR so returning users who
 * dismissed it never see a flash.
 */
export function OnboardingBanner({
  realConfigured,
  className,
}: {
  realConfigured: number;
  /** Unused; the setup page shows the template. */
  envTemplate?: string;
  className?: string;
}) {
  const hydrated = useHydrated();
  const [state, update] = useOnboarding();
  if (!hydrated || realConfigured > 0 || state.dismissed || state.completed) return null;

  return (
    <section
      aria-label="Simulated routers notice"
      className={cn("mb-8 flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm", className)}
    >
      <p className="min-w-0 flex-1 text-fg-muted">
        <span className="font-medium text-fg">You&apos;re using two built-in practice routers.</span> They run offline so you can
        try everything. Connect a real router to compare live results.
      </p>
      <ButtonLink href="/onboarding" variant="secondary" size="sm" className="max-sm:hidden">
        Connect a router
      </ButtonLink>
      <button
        type="button"
        onClick={() => update({ dismissed: true })}
        className="rounded-lg p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fg"
        aria-label="Dismiss"
      >
        <IconX size={15} />
      </button>
    </section>
  );
}
