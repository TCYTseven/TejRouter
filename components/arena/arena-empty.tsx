import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { IconArrowRight, IconEyeOff, IconTerminal, IconTrophy } from "@/components/ui/icons";
import { ImportVotesButton } from "./vote-actions";

const STEPS = [
  {
    icon: IconTerminal,
    title: "Run a playground round",
    body: "Pick two or more routers and send one prompt. Responses stream side by side.",
  },
  {
    icon: IconEyeOff,
    title: "Optionally go blind",
    body: "Turn on blind mode so routers show as Router A, B, C until you vote. It removes brand bias.",
  },
  {
    icon: IconTrophy,
    title: "Pick the best response",
    body: "Choose a winner, call it a tie, or mark all bad. Every vote lands here and updates the ratings.",
  },
];

/** First-run state: explains how votes are collected and links to the playground. */
export function ArenaEmpty({ invalidOnly }: { invalidOnly?: number }) {
  return (
    <section
      aria-labelledby="arena-empty-title"
      className="relative overflow-hidden rounded-xl border border-dashed border-border-strong bg-[radial-gradient(ellipse_at_50%_0%,var(--surface-2),transparent_70%)] px-5 py-10 sm:px-10 sm:py-14"
    >
      <div className="mx-auto max-w-3xl text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-surface text-accent-text shadow-sm">
          <IconTrophy size={20} />
        </div>
        <h2 id="arena-empty-title" className="text-lg font-semibold tracking-tight text-fg sm:text-xl">
          {invalidOnly ? "No usable votes yet" : "No votes yet"}
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-fg-muted">
          {invalidOnly
            ? `${invalidOnly} stored vote${invalidOnly === 1 ? " is" : "s are"} invalid (fewer than two routers, or a winner that was not in the round). `
            : null}
          The arena ranks routers by your own judgement. Each vote is a set of pairwise wins and ties; a Bradley-Terry model turns
          them into ratings with bootstrap intervals.
        </p>
      </div>
      <ol className="mx-auto mt-8 grid max-w-4xl gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-lg border border-border bg-surface p-4 text-left shadow-sm">
            <div className="flex items-center gap-2">
              <span className="num flex h-5 w-5 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-text">
                {i + 1}
              </span>
              <s.icon size={14} className="text-fg-subtle" />
            </div>
            <h3 className="mt-3 text-sm font-medium text-fg">{s.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-fg-muted">{s.body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
        <ButtonLink href="/playground" variant="accent" size="lg" rightIcon={<IconArrowRight size={14} />}>
          Open the playground
        </ButtonLink>
        <ImportVotesButton size="lg" variant="outline" />
      </div>
      <p className="mt-4 text-center text-[11px] text-fg-subtle">
        Votes stay in this browser&apos;s local storage.{" "}
        <Link href="/methodology#21-arena-human-votes" className="underline underline-offset-2 hover:text-fg">
          How ratings are computed
        </Link>
      </p>
    </section>
  );
}
