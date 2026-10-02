import type { ReactNode } from "react";
import type { ArenaLeaderboard } from "@/lib/analysis/arena";
import { formatNumber, formatPercent } from "@/lib/client/format";
import { armLabel, matrixIndex } from "./arm-meta";
import { ArmMatrix, DivergingLegend } from "./arm-matrix";

function half(x: number) {
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
}

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div>
        <h3 id={id} className="text-[15px] font-semibold text-fg">
          {title}
        </h3>
        <p className="mt-1 text-sm text-fg-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

/** Model-implied chance that the row router beats the column router. */
export function WinProbability({ lb, armIds }: { lb: ArenaLeaderboard; armIds: string[] }) {
  const idx = matrixIndex(lb.winProbability.armIds);
  const ranks = new Map(lb.arms.map((a) => [a.armId, a.rank]));
  return (
    <Section
      id="winprob-title"
      title="Chance of winning"
      description="How likely the router in each row is to beat the router in each column, based on the ratings."
    >
      <ArmMatrix
        armIds={armIds}
        ranks={ranks}
        caption="Chance that the row router beats the column router."
        cell={(row, col) => {
          const p = lb.winProbability.matrix[idx.get(row)!]?.[idx.get(col)!] ?? 0.5;
          return {
            share: p,
            label: formatPercent(p, 0),
            tip: (
              <>
                <span className="num block font-semibold">{formatPercent(p, 1)}</span>
                <span className="text-fg-muted">
                  {armLabel(row)} beats {armLabel(col)}
                </span>
              </>
            ),
            aria: `${armLabel(row)} beats ${armLabel(col)} with probability ${formatPercent(p, 1)}`,
          };
        }}
      />
      <DivergingLegend left="Column favored" right="Row favored" />
    </Section>
  );
}

/** Observed record: score (wins + half of ties) of the row router against the column router. */
export function HeadToHead({ lb, armIds }: { lb: ArenaLeaderboard; armIds: string[] }) {
  const idx = matrixIndex(lb.headToHead.armIds);
  const ranks = new Map(lb.arms.map((a) => [a.armId, a.rank]));
  return (
    <Section
      id="h2h-title"
      title="Head-to-head record"
      description="Wins and losses when two routers met in the same vote. A tie counts as half a win for each."
    >
      <ArmMatrix
        armIds={armIds}
        ranks={ranks}
        caption="Head-to-head score and number of meetings between each pair of routers."
        cell={(row, col) => {
          const i = idx.get(row)!;
          const j = idx.get(col)!;
          const games = lb.headToHead.games[i]?.[j] ?? 0;
          const score = lb.headToHead.score[i]?.[j] ?? 0;
          if (!games)
            return {
              share: null,
              label: "–",
              tip: <span className="text-fg-muted">Never in the same vote</span>,
              aria: `${armLabel(row)} and ${armLabel(col)} have not met`,
            };
          const share = score / games;
          return {
            share,
            label: `${half(score)}–${half(games - score)}`,
            tip: (
              <>
                <span className="num block font-semibold">
                  {half(score)}–{half(games - score)} ({formatPercent(share, 0)})
                </span>
                <span className="text-fg-muted">
                  {armLabel(row)} vs {armLabel(col)}, met {formatNumber(games)} time{games === 1 ? "" : "s"}
                </span>
              </>
            ),
            aria: `${armLabel(row)} scored ${half(score)} of ${games} against ${armLabel(col)}`,
          };
        }}
      />
      <DivergingLegend left="Row lost more" right="Row won more" />
    </Section>
  );
}
