import { ButtonLink } from "@/components/ui/button";

/** First-run state: one sentence, one action, one line on how voting works. */
export function ArenaEmpty({ invalidOnly }: { invalidOnly?: number }) {
  return (
    <section aria-labelledby="arena-empty-title" className="rounded-xl border border-border bg-surface px-6 py-12 text-center max-sm:px-5">
      <h2 id="arena-empty-title" className="text-[15px] font-medium text-fg">
        {invalidOnly
          ? `None of your ${invalidOnly} saved vote${invalidOnly === 1 ? " can" : "s can"} be used yet, so there is nothing to rank.`
          : "Your rankings will appear here once you vote on a few comparisons."}
      </h2>
      <div className="mt-5 flex justify-center">
        <ButtonLink href="/playground" variant="primary">
          Go to Compare
        </ButtonLink>
      </div>
      <p className="mx-auto mt-5 max-w-md text-sm text-fg-muted">
        Send a prompt to two or more routers with blind mode on, then pick the best answer.
      </p>
    </section>
  );
}
