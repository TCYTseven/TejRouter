"use client";

import { HeatmapTable, IntervalPlot, ScaleLegend, TipNote, TipRow, TipTitle, divergingFill, divergingInk, type IntervalRow } from "@/components/charts";
import { Disclosure } from "@/components/ui/disclosure";
import { ci, levelPct, num, pct } from "./format";
import { METHOD, Panel, useReportCtx } from "./section";

export function RatingsSection() {
  const { report, arm, level } = useReportCtx();
  const R = report.ratings;
  const L = levelPct(level);
  const online = new Map(R.onlineElo.map((o) => [o.armId, o.rating]));
  const rated = R.rows.filter((r) => r.rating != null);
  const top = rated[0];

  const rows: IntervalRow[] = R.rows.map((r) => {
    const a = arm(r.armId);
    const rank = r.rankLo != null && r.rankHi != null && r.rankLo !== r.rankHi ? `#${r.rank} (${r.rankLo}–${r.rankHi})` : `#${r.rank}`;
    return {
      key: r.armId,
      label: a.label,
      color: a.color,
      hollowSwatch: a.simulated,
      value: r.rating,
      lo: r.lo,
      hi: r.hi,
      marker: online.get(r.armId) ?? null,
      valueText: r.rating == null ? "unrated" : `${Math.round(r.rating)} ${ci(r.lo, r.hi, (v) => String(Math.round(v)))}`,
      subText: `rank ${rank}`,
      tip: (
        <div>
          <TipTitle>{a.label}</TipTitle>
          <TipRow color={a.color} label={`rating, ${L} interval`} value={r.rating == null ? "—" : String(Math.round(r.rating))} sub={ci(r.lo, r.hi, (v) => String(Math.round(v)))} />
          <TipRow label="online Elo" value={online.get(r.armId) == null ? "—" : String(Math.round(online.get(r.armId)!))} shape="none" />
          <TipRow label="rank range" value={rank} shape="none" />
          <TipNote>
            {num(r.score, 1)} points from {r.games} head-to-head tasks (a tie counts half).
          </TipNote>
        </div>
      ),
    };
  });

  const takeaway = (
    <>
      Treats every shared task as a match between two routers and fits a chess-style rating (Bradley-Terry, Elo scale: 1000 is average, 400 points means 10 to 1 odds).
      {top ? (
        <>
          {" "}
          <span className="text-fg">{arm(top.armId).label}</span> rates highest
          {top.rankLo != null && top.rankHi != null && top.rankHi > top.rankLo ? `, though its rank could be anywhere from ${top.rankLo} to ${top.rankHi}` : " and ranks first in every resample"}.
        </>
      ) : null}
    </>
  );

  const ids = R.winProbability.armIds;
  return (
    <Panel id="ratings" title="Ratings" takeaway={takeaway} method={METHOD.ratings}>
      <IntervalPlot
        rows={rows}
        format={(v) => String(Math.round(v))}
        reference={{ value: 1000 }}
        axisLabel={`Rating, ${L} interval`}
        ariaLabel="Bradley-Terry ratings with intervals"
        markerLabel="Online Elo (sequential updates, for comparison)"
      />
      {ids.length >= 2 ? (
        <Disclosure className="mt-5" summary="Chance that one router beats another on a task">
          <div className="pt-2">
            <HeatmapTable
              caption="Probability that the row router beats the column router on a task"
              rowHeader="Row beats column"
              rows={ids.map((id) => ({ key: id, label: arm(id).label, text: arm(id).label }))}
              cols={ids.map((id) => ({ key: id, label: arm(id).label, text: arm(id).label }))}
              rowHeaderWidth={220}
              cellMinWidth={96}
              cell={(row, col) => {
                if (row === col) return { value: null, display: "", blank: true };
                const v = R.winProbability.matrix[ids.indexOf(row)]?.[ids.indexOf(col)];
                if (v == null) return { value: null, display: "—", tip: "Not rated" };
                const t = Math.max(-1, Math.min(1, ((v - 0.5) * 2) / 0.5));
                return { value: v, display: `${Math.round(v * 100)}%`, fill: divergingFill(t), ink: divergingInk(t), tip: `${arm(row).label} beats ${arm(col).label} with probability ${pct(v)}` };
              }}
              legend={<ScaleLegend stops={[divergingFill(-1), divergingFill(0), divergingFill(1)]} left="25%" right="75%" middle="50%" label="Row wins" />}
            />
          </div>
        </Disclosure>
      ) : null}
    </Panel>
  );
}
