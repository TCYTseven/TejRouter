import type { ArenaLeaderboard } from "@/lib/analysis/arena";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { IconHash, IconSigma } from "@/components/ui/icons";
import { formatNumber, formatPercent } from "@/lib/client/format";
import { armLabel, matrixIndex } from "./arm-meta";
import { ArmMatrix, DivergingLegend } from "./arm-matrix";

function half(x: number) {
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
}

/** Model-implied P(row beats column) from the Bradley-Terry fit. */
export function WinProbabilityCard({ lb, armIds }: { lb: ArenaLeaderboard; armIds: string[] }) {
  const idx = matrixIndex(lb.winProbability.armIds);
  const ranks = new Map(lb.arms.map((a) => [a.armId, a.rank]));
  return (
    <Card as="section" aria-labelledby="winprob-title">
      <CardHeader
        icon={<IconSigma size={14} />}
        title={<span id="winprob-title">Win probability</span>}
        description="Model-implied chance that the row router beats the column router in a head-to-head vote."
      />
      <CardBody className="space-y-3">
        <ArmMatrix
          armIds={armIds}
          ranks={ranks}
          caption="Bradley-Terry probability that the row router beats the column router."
          cell={(row, col) => {
            const p = lb.winProbability.matrix[idx.get(row)!]?.[idx.get(col)!] ?? 0.5;
            return {
              share: p,
              label: formatPercent(p, 0),
              tip: (
                <>
                  <span className="num block text-[13px] font-semibold">{formatPercent(p, 1)}</span>
                  <span className="text-fg-muted">
                    {armLabel(row)} beats {armLabel(col)}
                  </span>
                </>
              ),
              aria: `${armLabel(row)} beats ${armLabel(col)} with probability ${formatPercent(p, 1)}`,
            };
          }}
        />
        <DivergingLegend left="column favored" right="row favored" />
      </CardBody>
    </Card>
  );
}

/** Observed record: score (wins + ½ ties) of the row router against the column router. */
export function HeadToHeadCard({ lb, armIds }: { lb: ArenaLeaderboard; armIds: string[] }) {
  const idx = matrixIndex(lb.headToHead.armIds);
  const ranks = new Map(lb.arms.map((a) => [a.armId, a.rank]));
  return (
    <Card as="section" aria-labelledby="h2h-title">
      <CardHeader
        icon={<IconHash size={14} />}
        title={<span id="h2h-title">Head-to-head record</span>}
        description="Observed score of the row router against the column router (wins + ½ ties) and the number of pairwise games."
      />
      <CardBody className="space-y-3">
        <ArmMatrix
          armIds={armIds}
          ranks={ranks}
          caption="Observed head-to-head score and games between each pair of routers."
          cell={(row, col) => {
            const i = idx.get(row)!;
            const j = idx.get(col)!;
            const games = lb.headToHead.games[i]?.[j] ?? 0;
            const score = lb.headToHead.score[i]?.[j] ?? 0;
            if (!games)
              return {
                share: null,
                label: "—",
                tip: <span className="text-fg-muted">Never in the same round</span>,
                aria: `${armLabel(row)} and ${armLabel(col)} have not met`,
              };
            const share = score / games;
            return {
              share,
              label: `${half(score)}–${half(games - score)}`,
              sub: `${formatNumber(games)} game${games === 1 ? "" : "s"}`,
              tip: (
                <>
                  <span className="num block text-[13px] font-semibold">
                    {half(score)}–{half(games - score)} · {formatPercent(share, 0)}
                  </span>
                  <span className="text-fg-muted">
                    {armLabel(row)} vs {armLabel(col)}, {games} game{games === 1 ? "" : "s"}
                  </span>
                </>
              ),
              aria: `${armLabel(row)} scored ${half(score)} of ${games} against ${armLabel(col)}`,
            };
          }}
        />
        <DivergingLegend left="row lost more" right="row won more" />
      </CardBody>
    </Card>
  );
}
