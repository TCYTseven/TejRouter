import type { ArenaLeaderboard } from "@/lib/analysis/arena";
import { ProviderDot } from "@/components/ui/provider";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/client/cn";
import { formatNumber, formatPercent } from "@/lib/client/format";
import { armInfo, armLabel, ratingDomain } from "./arm-meta";

const th = "px-4 py-3 text-left text-[13px] font-medium whitespace-nowrap text-fg-muted max-sm:px-2.5";
const td = "px-4 py-3.5 align-middle max-sm:px-2.5";

/**
 * Thin interval bar: the plausible range (95%) as a 2px line, the rating as a
 * dot, and a hairline at the 1000 average. All rows share one domain so bars
 * are comparable down the column. Positioned in percentages so it fills the cell.
 */
function IntervalBar({
  rating,
  lo,
  hi,
  domain,
  color,
  simulated,
}: {
  rating: number | null;
  lo: number | null;
  hi: number | null;
  domain: [number, number];
  color: string;
  simulated: boolean;
}) {
  const [d0, d1] = domain;
  const pct = (v: number) => `${((v - d0) / (d1 - d0)) * 100}%`;
  return (
    <span aria-hidden="true" className="relative block h-4 w-full">
      <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
      <span className="absolute top-0.5 bottom-0.5 w-px bg-border-strong" style={{ left: pct(1000) }} />
      {lo != null && hi != null ? (
        <span
          className="absolute top-1/2 h-[2px] -translate-y-1/2 rounded-full"
          style={{ left: pct(lo), width: `calc(${pct(hi)} - ${pct(lo)})`, background: color }}
        />
      ) : null}
      {rating != null ? (
        <span
          className="absolute top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: pct(rating),
            background: simulated ? "var(--surface)" : color,
            boxShadow: simulated ? `inset 0 0 0 2px ${color}, 0 0 0 2px var(--surface)` : "0 0 0 2px var(--surface)",
          }}
        />
      ) : null}
    </span>
  );
}

/** Ranked table: rating with its plausible range, win rate and votes. */
export function LeaderboardTable({ lb }: { lb: ArenaLeaderboard }) {
  const domain = ratingDomain(lb.arms);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[15px]">
        <caption className="sr-only">
          Routers ranked by rating from your votes, with the range each rating plausibly falls in, win rate and number of votes.
        </caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className={cn(th, "w-12 sm:w-16")}>
              <span className="max-sm:sr-only">Rank</span>
            </th>
            <th scope="col" className={th}>
              Router
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              Rating
            </th>
            <th scope="col" className={cn(th, "hidden w-[34%] sm:table-cell")}>
              <span className="sr-only">Plausible range</span>
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              Win rate
            </th>
            <th scope="col" className={cn(th, "hidden text-right sm:table-cell")}>
              Votes
            </th>
          </tr>
        </thead>
        <tbody>
          {lb.arms.map((a) => {
            const info = armInfo(a.armId);
            const range = a.lo != null && a.hi != null ? `${formatNumber(a.lo)} to ${formatNumber(a.hi)}` : null;
            return (
              <tr key={a.armId} className="border-b border-border last:border-0">
                <td className={cn(td, "num text-fg-muted")}>{a.rank}</td>
                <td className={cn(td, "max-w-[150px] sm:max-w-[280px]")}>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <ProviderDot color={info.color} simulated={info.simulated} size={10} />
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium break-words text-fg">{info.name}</span>
                      {info.model ? <span className="truncate text-[13px] text-fg-muted">{info.model}</span> : null}
                    </span>
                  </span>
                  <span className="mt-2 block pl-5 sm:hidden">
                    <IntervalBar rating={a.rating} lo={a.lo} hi={a.hi} domain={domain} color={info.color} simulated={info.simulated} />
                  </span>
                </td>
                <td className={cn(td, "num text-right font-semibold text-fg")}>{formatNumber(a.rating)}</td>
                <td className={cn(td, "hidden sm:table-cell")}>
                  <Tooltip
                    className="flex w-full"
                    content={
                      range ? (
                        <>
                          <span className="num block font-semibold">{range}</span>
                          <span className="text-fg-muted">Likely range for {armLabel(a.armId)}</span>
                        </>
                      ) : (
                        "Not enough votes for a range"
                      )
                    }
                  >
                    <span tabIndex={0} className="block w-full py-1 outline-none" aria-label={`${armLabel(a.armId)} likely range ${range ?? "unavailable"}`}>
                      <IntervalBar rating={a.rating} lo={a.lo} hi={a.hi} domain={domain} color={info.color} simulated={info.simulated} />
                    </span>
                  </Tooltip>
                </td>
                <td className={cn(td, "num text-right text-fg")}>
                  <span title={`${a.wins} wins, ${a.losses} losses, ${a.ties} ties in ${a.votes} votes`}>{formatPercent(a.winRate.value, 0)}</span>
                </td>
                <td className={cn(td, "num hidden text-right text-fg-muted sm:table-cell")}>{a.votes}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
