"use client";

import Link from "next/link";
import { useDeferredValue, useMemo } from "react";
import { arenaLeaderboard, type ArenaLeaderboard } from "@/lib/analysis/arena";
import { ButtonLink } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useArenaVotes, type ArenaVote } from "@/lib/client/arena-votes";
import { cn } from "@/lib/client/cn";
import { formatNumber } from "@/lib/client/format";
import { useHydrated } from "@/lib/client/onboarding";
import { armInfo } from "./arm-meta";
import { ArenaEmpty } from "./arena-empty";
import { LeaderboardTable } from "./leaderboard-table";
import { HeadToHead, WinProbability } from "./matrices";
import { VoteHistory } from "./vote-history";

/** Bootstrap resamples for the in-browser fit: enough for stable 95% ranges, fast on a laptop. */
const BOOTSTRAP = 500;

const plural = (n: number, word: string) => `${formatNumber(n)} ${word}${n === 1 ? "" : "s"}`;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** One sentence written from the data: who leads, and whether the lead is real. */
function takeaway(lb: ArenaLeaderboard): string {
  const rated = lb.arms.filter((a) => a.rating != null);
  const votes = plural(lb.validVotes, "vote");
  if (!rated.length) return `No router has a rating yet after ${votes}.`;
  const leader = armInfo(rated[0].armId).name;
  if (rated.length === 1) return `Only ${leader} has been rated so far; vote on more routers to compare them.`;
  // Routers whose plausible rank includes first place.
  const contenders = rated.filter((a) => a.rankLo != null && a.rankLo <= 1).length;
  if (contenders <= 1) return `${leader} leads after ${votes} and is clearly ahead.`;
  if (contenders >= rated.length) return `${leader} leads after ${votes}, but no router is clearly ahead yet.`;
  if (contenders === 2) return `${leader} leads after ${votes}; the top two are too close to call.`;
  const words = ["", "", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  return `${leader} leads after ${votes}; the top ${words[contenders] ?? contenders} are too close to call.`;
}

function HowSure({ lb }: { lb: ArenaLeaderboard }) {
  const spread = median(lb.arms.filter((a) => a.lo != null && a.hi != null).map((a) => (a.hi! - a.lo!) / 2));
  return (
    <section aria-labelledby="how-sure-title" className="max-w-[70ch]">
      <h2 id="how-sure-title" className="text-[15px] font-semibold text-fg">
        How sure is this?
      </h2>
      <p className="mt-1.5 text-[15px] text-fg-muted">
        Each bar shows where a router&apos;s rating likely sits. When two bars overlap, your votes can&apos;t tell those
        routers apart yet.
        {spread != null ? ` With ${plural(lb.validVotes, "vote")}, a rating could still be off by about ${formatNumber(spread)} points either way.` : ""}{" "}
        More votes on varied prompts narrow the bars. Ratings are relative: 1000 is the average of the routers you voted on.{" "}
        <Link href="/methodology#21-arena-human-votes" className="text-link hover:underline">
          How ratings work
        </Link>
      </p>
    </section>
  );
}

function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading votes">
      <Skeleton className="h-5 w-80 max-w-full" />
      <Skeleton className="h-64" />
    </div>
  );
}

const disclosureSummary = "py-4 text-[15px] font-medium text-fg";

function Ranked({ lb, votes, stale }: { lb: ArenaLeaderboard; votes: ArenaVote[]; stale: boolean }) {
  const armIds = lb.arms.map((a) => a.armId);
  return (
    <div className={cn("space-y-10 transition-opacity", stale && "opacity-70")}>
      <section aria-labelledby="takeaway" className="space-y-4">
        <h2 id="takeaway" className="text-lg font-semibold text-fg">
          {takeaway(lb)}
        </h2>
        <div className="rounded-xl border border-border bg-surface">
          <LeaderboardTable lb={lb} />
        </div>
        {lb.invalidVotes ? (
          <p className="text-sm text-fg-muted">
            {plural(lb.invalidVotes, "saved vote")} {lb.invalidVotes === 1 ? "isn't" : "aren't"} counted because the winner
            wasn&apos;t one of the routers in that comparison.
          </p>
        ) : null}
      </section>

      <HowSure lb={lb} />

      <div className="divide-y divide-border border-y border-border">
        <Disclosure summary="Show head-to-head" summaryClassName={disclosureSummary}>
          <div className="grid grid-cols-1 gap-10 pt-2 pb-8 lg:grid-cols-2">
            <WinProbability lb={lb} armIds={armIds} />
            <HeadToHead lb={lb} armIds={armIds} />
          </div>
        </Disclosure>
        <Disclosure summary={`Your votes (${formatNumber(votes.length)})`} summaryClassName={disclosureSummary}>
          <div className="pb-6">
            <VoteHistory votes={votes} />
          </div>
        </Disclosure>
      </div>
    </div>
  );
}

export function ArenaView() {
  const votes = useArenaVotes();
  const hydrated = useHydrated();
  // Keep deleting responsive: the bootstrap refit runs on the deferred list.
  const deferred = useDeferredValue(votes);
  const lb = useMemo(() => arenaLeaderboard(deferred, { bootstrapIterations: BOOTSTRAP, seed: 1, level: 0.95 }), [deferred]);
  const hasRanking = hydrated && lb.validVotes > 0;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Leaderboard"
        description="Rankings from your blind votes on the Compare page."
        actions={
          hasRanking ? (
            <ButtonLink href="/playground" variant="secondary">
              Vote on more
            </ButtonLink>
          ) : null
        }
      />

      {!hydrated ? (
        <Loading />
      ) : !votes.length ? (
        <ArenaEmpty />
      ) : lb.validVotes === 0 ? (
        <div className="space-y-10">
          <ArenaEmpty invalidOnly={lb.invalidVotes} />
          <div className="border-y border-border">
            <Disclosure summary={`Your votes (${formatNumber(votes.length)})`} summaryClassName={disclosureSummary}>
              <div className="pb-6">
                <VoteHistory votes={votes} />
              </div>
            </Disclosure>
          </div>
        </div>
      ) : (
        <Ranked lb={lb} votes={votes} stale={deferred !== votes} />
      )}
    </div>
  );
}
