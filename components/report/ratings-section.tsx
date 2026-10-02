"use client";

import { useState } from "react";
import { DataTable, HeatmapTable, IntervalPlot, ScaleLegend, TipNote, TipRow, TipTitle, divergingFill, divergingInk, type IntervalRow } from "@/components/charts";
import { Segmented } from "@/components/ui/segmented";
import { ci, levelPct, num, pct } from "./format";
import { ArmLabel, METHOD, ReportSection, Val, useReportCtx } from "./section";

export function RatingsSection({ index }: { index: number }) {
  const { report, arm, level } = useReportCtx();
  const [view, setView] = useState<"chart" | "table">("chart");
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
      subText: `rank ${rank} · ${r.games} games`,
      tip: (
        <div>
          <TipTitle>{a.label}</TipTitle>
          <TipRow color={a.color} label={`Bradley-Terry Elo, ${L} CI`} value={r.rating == null ? "—" : String(Math.round(r.rating))} sub={ci(r.lo, r.hi, (v) => String(Math.round(v)))} />
          <TipRow label="online Elo (order-dependent)" value={online.get(r.armId) == null ? "—" : String(Math.round(online.get(r.armId)!))} shape="none" />
          <TipRow label="rank range" value={rank} shape="none" />
          <TipNote>
            Score {num(r.score, 1)} from {r.games} task-level games (ties count ½).
          </TipNote>
        </div>
      ),
    };
  });

  const takeaway = top ? (
    <>
      {arm(top.armId).label} is rated highest ({Math.round(top.rating!)}
      {top.lo != null && top.hi != null ? `, ${L} CI ${Math.round(top.lo)}–${Math.round(top.hi)}` : ""})
      {top.rankLo != null && top.rankHi != null && top.rankHi > top.rankLo ? `, but its rank could be anywhere from #${top.rankLo} to #${top.rankHi}` : " and holds rank #1 in every bootstrap resample"}. Ratings come from {R.nMatches.toLocaleString("en-US")} head-to-head task outcomes; 400 points = 10:1 odds.
    </>
  ) : (
    "Not enough head-to-head outcomes to fit ratings."
  );

  const ids = R.winProbability.armIds;
  return (
    <ReportSection
      id="ratings"
      index={index}
      title="Ratings"
      takeaway={takeaway}
      method={METHOD.ratings}
      actions={<Segmented size="xs" label="Ratings view" value={view} onChange={setView} options={[{ value: "chart", label: "Chart" }, { value: "table", label: "Table" }]} />}
    >
      {view === "chart" ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="min-w-0">
            <h3 className="mb-2 text-xs font-semibold text-fg">Bradley-Terry Elo</h3>
            <IntervalPlot
              rows={rows}
              format={(v) => String(Math.round(v))}
              reference={{ value: 1000 }}
              axisLabel={`Elo-scale rating (1000 = average), ${L} bootstrap CI`}
              ariaLabel="Bradley-Terry ratings with confidence intervals"
              markerLabel="Online Elo (sequential updates, for comparison)"
            />
          </div>
          <div className="min-w-0">
            <h3 className="mb-2 text-xs font-semibold text-fg">Win probability (row beats column)</h3>
            {ids.length >= 2 ? (
              <HeatmapTable
                caption="Bradley-Terry implied probability that the row arm beats the column arm on a task"
                rowHeader="Row arm"
                rows={ids.map((id) => ({ key: id, label: arm(id).label, text: arm(id).label }))}
                cols={ids.map((id) => ({ key: id, label: arm(id).label, text: arm(id).label }))}
                rowHeaderWidth={150}
                cellMinWidth={64}
                cell={(row, col) => {
                  if (row === col) return { value: null, display: "", blank: true };
                  const v = R.winProbability.matrix[ids.indexOf(row)]?.[ids.indexOf(col)];
                  if (v == null) return { value: null, display: "—", tip: "Not rated" };
                  const t = (v - 0.5) * 2 / 0.5;
                  return {
                    value: v,
                    display: `${Math.round(v * 100)}%`,
                    fill: divergingFill(Math.max(-1, Math.min(1, t))),
                    ink: divergingInk(Math.max(-1, Math.min(1, t))),
                    tip: `${arm(row).label} beats ${arm(col).label} with probability ${pct(v)}`,
                  };
                }}
                legend={<ScaleLegend stops={[divergingFill(-1), divergingFill(0), divergingFill(1)]} left="25%" right="75%" middle="50%" label="P(row wins)" />}
              />
            ) : (
              <p className="text-[12px] text-fg-subtle">Needs at least two rated arms.</p>
            )}
          </div>
        </div>
      ) : (
        <DataTable
          caption="Ratings table"
          rows={R.rows}
          getKey={(r) => r.armId}
          minWidth={760}
          columns={[
            { key: "rank", header: "Rank", render: (r) => <span className="num">#{r.rank}</span>, sort: (r) => r.rank },
            { key: "arm", header: "Arm", render: (r) => <ArmLabel arm={arm(r.armId)} /> },
            { key: "bt", header: "BT Elo", align: "right", render: (r) => <Val v={r.rating} fmt={(v) => String(Math.round(v))} reason="no head-to-head outcomes" />, sort: (r) => r.rating },
            { key: "ci", header: `${L} CI`, align: "right", render: (r) => ci(r.lo, r.hi, (v) => String(Math.round(v))) },
            { key: "rr", header: "Rank range", align: "right", render: (r) => (r.rankLo != null ? `${r.rankLo}–${r.rankHi}` : "—") },
            { key: "on", header: "Online Elo", align: "right", render: (r) => <Val v={online.get(r.armId)} fmt={(v) => String(Math.round(v))} reason="no games" /> },
            { key: "g", header: "Games", align: "right", render: (r) => r.games, sort: (r) => r.games },
            { key: "s", header: "Score", align: "right", render: (r) => num(r.score, 1), sort: (r) => r.score },
          ]}
        />
      )}
      <p className="mt-3 text-[11.5px] text-fg-subtle">
        {R.method}. Every task where two arms both ran is a game; the arm with the higher task score wins. Bootstrap: {R.bootstrapIterations.toLocaleString("en-US")} task resamples.
      </p>
    </ReportSection>
  );
}
