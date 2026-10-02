"use client";

import Link from "next/link";
import { useDeferredValue, useMemo } from "react";
import { arenaLeaderboard, type ArenaLeaderboard } from "@/lib/analysis/arena";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { IconActivity, IconAlert, IconArrowRight, IconClock, IconInfo, IconTerminal, IconTrophy, IconCpu } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat";
import { useArenaVotes, type ArenaVote } from "@/lib/client/arena-votes";
import { cn } from "@/lib/client/cn";
import { formatDateTime, formatNumber, formatRelativeTime } from "@/lib/client/format";
import { useHydrated } from "@/lib/client/onboarding";
import { armInfo, rankRange } from "./arm-meta";
import { ArenaEmpty } from "./arena-empty";
import { useNow } from "./hooks";
import { LeaderboardTable } from "./leaderboard-table";
import { HeadToHeadCard, WinProbabilityCard } from "./matrices";
import { RatingChart } from "./rating-chart";
import { VoteHistory } from "./vote-history";

/** Bootstrap resamples for the in-browser fit: enough for stable 95% percentiles, fast on a laptop. */
const BOOTSTRAP = 500;
const FEW_VOTES = 30;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function Hero({ lb, votes }: { lb: ArenaLeaderboard; votes: ArenaVote[] }) {
  const now = useNow();
  const rated = lb.arms.filter((a) => a.rating != null);
  const k = lb.headToHead.armIds.length;
  let pairs = 0;
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) if (lb.headToHead.games[i][j] > 0) pairs++;
  const last = votes.reduce((m, v) => (v.at > m ? v.at : m), 0);
  const leader = rated[0];
  const leaderRange = leader ? rankRange(leader) : null;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        label="Total votes"
        icon={<IconActivity size={12} />}
        value={formatNumber(lb.totalVotes)}
        sub={lb.invalidVotes ? `${lb.validVotes} valid · ${lb.invalidVotes} skipped` : "all valid"}
      />
      <StatTile
        label="Routers rated"
        icon={<IconCpu size={12} />}
        value={rated.length}
        sub={`${pairs} of ${(k * (k - 1)) / 2} pairs have met`}
      />
      <StatTile
        label="Last vote"
        icon={<IconClock size={12} />}
        value={last ? (now ? formatRelativeTime(last, now) : "—") : "—"}
        sub={last ? formatDateTime(last) : undefined}
      />
      <StatTile
        label="Leader"
        icon={<IconTrophy size={12} />}
        emphasis={Boolean(leader && !leaderRange)}
        value={leader ? <span className="font-sans">{armInfo(leader.armId).name}</span> : "—"}
        sub={
          leader
            ? `${formatNumber(leader.rating)} · ${leaderRange ? `rank interval ${leaderRange}, not yet separated` : "clear #1 at 95%"}`
            : undefined
        }
      />
    </div>
  );
}

function Caveats({ lb }: { lb: ArenaLeaderboard }) {
  const widths = lb.arms.filter((a) => a.lo != null && a.hi != null).map((a) => (a.hi! - a.lo!) / 2);
  const mw = median(widths);
  const few = lb.validVotes < FEW_VOTES;
  const items = [
    {
      icon: IconAlert,
      tone: few,
      title: few ? "Early days: intervals are wide" : "Intervals shrink slowly",
      body: `With ${lb.validVotes} valid vote${lb.validVotes === 1 ? "" : "s"}, the typical 95% interval is about ±${formatNumber(mw ?? 0)} points. Gaps under ~50 points need many votes on varied prompts.`,
    },
    {
      icon: IconInfo,
      title: "Ratings are relative",
      body: `1000 is the average of the ${lb.arms.length} routers you voted on. Adding a router or a batch of votes can move every rating.`,
    },
    {
      icon: IconInfo,
      title: "Overlapping ranks are not an ordering",
      body: "If two routers' rank intervals overlap, the data cannot yet tell them apart. Read the whiskers, not just the order.",
    },
    {
      icon: IconInfo,
      title: "Votes are subjective",
      body: "Blind mode removes brand bias. Ties and all-bad votes count as half a win each, pulling ratings together.",
    },
  ];
  return (
    <Card as="section" aria-labelledby="caveats-title" className="flex flex-col">
      <CardHeader icon={<IconInfo size={14} />} title={<span id="caveats-title">Reading the arena</span>} />
      <CardBody className="flex-1 space-y-3.5">
        {items.map((it) => (
          <div key={it.title} className="flex gap-2.5">
            <it.icon size={14} className={cn("mt-0.5 shrink-0", it.tone ? "text-warning" : "text-fg-subtle")} />
            <div>
              <p className="text-[13px] font-medium text-fg">{it.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{it.body}</p>
            </div>
          </div>
        ))}
        <Link
          href="/methodology#21-arena-human-votes"
          className="inline-flex items-center gap-1 pt-1 text-xs font-medium text-accent-text hover:underline"
        >
          Methodology: arena ratings <IconArrowRight size={12} />
        </Link>
      </CardBody>
    </Card>
  );
}

function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading votes">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[74px]" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

export function ArenaView() {
  const votes = useArenaVotes();
  const hydrated = useHydrated();
  // Keep typing/deleting responsive: the bootstrap refit runs on the deferred list.
  const deferred = useDeferredValue(votes);
  const lb = useMemo(() => arenaLeaderboard(deferred, { bootstrapIterations: BOOTSTRAP, seed: 1, level: 0.95 }), [deferred]);
  const stale = deferred !== votes;
  const armIds = lb.arms.map((a) => a.armId);
  return (
    <div className="space-y-5">
      <PageHeader
        className="pb-0"
        breadcrumbs={[{ label: "TejRouter", href: "/" }, { label: "Arena" }]}
        icon={<IconTrophy size={16} />}
        title="Arena"
        description="A human-preference leaderboard from your blind playground votes. Bradley-Terry ratings with bootstrap intervals, so you can see which gaps are real."
        actions={
          <ButtonLink href="/playground" variant={votes.length ? "secondary" : "accent"} leftIcon={<IconTerminal size={14} />}>
            Vote in the playground
          </ButtonLink>
        }
      />

      {!hydrated ? (
        <Loading />
      ) : !votes.length ? (
        <ArenaEmpty />
      ) : lb.validVotes === 0 ? (
        <>
          <ArenaEmpty invalidOnly={lb.invalidVotes} />
          <VoteHistory votes={votes} />
        </>
      ) : (
        <div className={cn("space-y-5 transition-opacity", stale && "opacity-70")}>
          <Hero lb={lb} votes={votes} />

          <Card as="section" aria-labelledby="leaderboard-title">
            <CardHeader
              icon={<IconTrophy size={14} />}
              title={<span id="leaderboard-title">Leaderboard</span>}
              description={`Bradley-Terry fit on ${lb.validVotes} vote${lb.validVotes === 1 ? "" : "s"} · ${lb.bootstrapIterations} bootstrap resamples of votes · 95% intervals`}
            />
            <LeaderboardTable lb={lb} />
          </Card>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <Card as="section" aria-labelledby="ratings-chart-title" className="flex flex-col">
              <CardHeader
                title={<span id="ratings-chart-title">Rating intervals</span>}
                description="Dot: rating. Whisker: 95% bootstrap interval. Vertical line: the 1000 average. Square marks a live router, ring a simulator."
              />
              <CardBody className="flex flex-1 items-center">
                <RatingChart arms={lb.arms} />
              </CardBody>
            </Card>
            <Caveats lb={lb} />
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <WinProbabilityCard lb={lb} armIds={armIds} />
            <HeadToHeadCard lb={lb} armIds={armIds} />
          </div>

          <VoteHistory votes={votes} />
        </div>
      )}
    </div>
  );
}
