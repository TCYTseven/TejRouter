import type { ArenaLeaderboard } from "@/lib/analysis/arena";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/client/cn";
import { formatNumber, formatPercent } from "@/lib/client/format";
import { armInfo, armLabel, rankRange, ratingDomain } from "./arm-meta";
import { ArmName } from "./arm-name";
import { CiBar } from "./ci-bar";

const th = "px-3 py-2 text-left text-[11px] font-medium whitespace-nowrap text-fg-subtle";
const td = "px-3 py-2.5 align-middle";

/** Ranked table: Bradley-Terry rating with interval, Wilson win rate and vote tallies. */
export function LeaderboardTable({ lb }: { lb: ArenaLeaderboard }) {
  const domain = ratingDomain(lb.arms);
  const level = "95%";
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <caption className="sr-only">
          Arena leaderboard: routers ranked by Bradley-Terry rating with {level} bootstrap intervals, win rate with Wilson
          interval, and vote tallies.
        </caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className={cn(th, "w-16")}>
              Rank
            </th>
            <th scope="col" className={th}>
              Router
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              <Tooltip side="bottom" content="Bradley-Terry rating on the Elo scale (mean 1000). Whisker: 95% bootstrap interval, resampling votes. Hairline: 1000.">
                <span className="cursor-help border-b border-dotted border-fg-subtle">Rating</span>
              </Tooltip>
            </th>
            <th scope="col" className={cn(th, "hidden sm:table-cell")}>
              <span className="sr-only">Rating interval</span>
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              <Tooltip side="bottom" content="Wins / votes the router appeared in, with a 95% Wilson interval. Ties and all-bad votes count in the denominator.">
                <span className="cursor-help border-b border-dotted border-fg-subtle">Win rate</span>
              </Tooltip>
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              W / L / T
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              <Tooltip side="bottom" content="Votes where every response was marked bad. Scored as ties for the rating.">
                <span className="cursor-help border-b border-dotted border-fg-subtle">All bad</span>
              </Tooltip>
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              Votes
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              <Tooltip side="bottom" align="end" content="Sequential Elo (K = 16) averaged over 20 shuffled vote orders. Order-dependent; shown for comparison only.">
                <span className="cursor-help border-b border-dotted border-fg-subtle">Online Elo</span>
              </Tooltip>
            </th>
          </tr>
        </thead>
        <tbody>
          {lb.arms.map((a, i) => {
            const info = armInfo(a.armId);
            const range = rankRange(a);
            const ci = a.lo != null && a.hi != null ? `${formatNumber(a.lo)}–${formatNumber(a.hi)}` : null;
            return (
              <tr key={a.armId} className={cn("border-b border-border last:border-0 hover:bg-surface-2/60", i === 0 && "bg-accent-soft/40")}>
                <td className={td}>
                  <div className="flex flex-col">
                    <span className="num text-sm font-semibold text-fg">{a.rank}</span>
                    {range ? (
                      <span className="num text-[10px] text-fg-subtle" title={`95% bootstrap rank interval: ${range}`}>
                        {range}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className={cn(td, "max-w-[260px]")}>
                  <ArmName armId={a.armId} stacked />
                </td>
                <td className={cn(td, "text-right")}>
                  <div className="num font-semibold text-fg">{formatNumber(a.rating)}</div>
                  <div className="num text-[10px] whitespace-nowrap text-fg-subtle">{ci ?? "—"}</div>
                </td>
                <td className={cn(td, "hidden pl-0 sm:table-cell")}>
                  <span className="sr-only">
                    {armLabel(a.armId)} rating {formatNumber(a.rating)}, 95% interval {ci ?? "unavailable"}
                  </span>
                  <CiBar rating={a.rating} lo={a.lo} hi={a.hi} domain={domain} color={info.color} simulated={info.simulated} />
                </td>
                <td className={cn(td, "text-right")}>
                  <div className="num text-fg">{formatPercent(a.winRate.value, 0)}</div>
                  <div className="num text-[10px] whitespace-nowrap text-fg-subtle">
                    {a.winRate.lo != null && a.winRate.hi != null
                      ? `${formatPercent(a.winRate.lo, 0)}–${formatPercent(a.winRate.hi, 0)}`
                      : "—"}
                  </div>
                </td>
                <td className={cn(td, "num text-right whitespace-nowrap text-fg-muted")}>
                  <span className="text-fg">{a.wins}</span>
                  <span className="text-fg-subtle"> / </span>
                  {a.losses}
                  <span className="text-fg-subtle"> / </span>
                  {a.ties}
                </td>
                <td className={cn(td, "num text-right text-fg-muted")}>{a.allBad}</td>
                <td className={cn(td, "num text-right text-fg-muted")}>{a.votes}</td>
                <td className={cn(td, "num text-right text-fg-subtle")}>{formatNumber(a.onlineElo)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
