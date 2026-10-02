"use client";

import { useMemo, useState } from "react";
import { DataTable, IntervalPlot, LineChart, TipNote, TipRow, TipTitle, interpolateAt, logDomain, niceDomain, type IntervalRow, type LineSeries } from "@/components/charts";
import { Segmented } from "@/components/ui/segmented";
import type { ArmStats, Estimate, Summary } from "@/lib/analysis/types";
import { formatTps } from "@/lib/client/format";
import { ci, levelPct, ms } from "./format";
import { ArmLabel, METHOD, ReportSection, Val, useReportCtx } from "./section";

export function LatencySection({ index }: { index: number }) {
  const { report, arm, level } = useReportCtx();
  const [mode, setMode] = useState<"ecdf" | "kde">("ecdf");
  const [scale, setScale] = useState<"linear" | "log">("linear");
  const [view, setView] = useState<"chart" | "table">("chart");
  const L = levelPct(level);
  const arms = report.perArm.filter((a) => a.latency.n > 0);

  const xMax = useMemo(() => Math.max(1, ...arms.map((a) => a.latency.p99 ?? a.latency.max ?? 0)) * 1.05, [arms]);
  const xMin = useMemo(() => Math.max(1, Math.min(...arms.map((a) => a.latency.min ?? Infinity))), [arms]);

  const series = useMemo<LineSeries[]>(
    () =>
      arms.map((a) => {
        const info = arm(a.armId);
        const pts = mode === "ecdf" ? a.latencyEcdf : a.latencyKde.map((p) => ({ x: p.x, y: p.y * 1000 }));
        const marks = (["p50", "p90", "p99"] as const)
          .map((k) => {
            const xv = a.latency[k];
            if (xv == null) return null;
            const yv = mode === "ecdf" ? (k === "p50" ? 0.5 : k === "p90" ? 0.9 : 0.99) : interpolateAt(pts, xv);
            return yv == null ? null : { x: xv, y: yv, label: k };
          })
          .filter((m): m is { x: number; y: number; label: "p50" | "p90" | "p99" } => m != null);
        return { key: a.armId, label: info.label, color: info.color, points: pts, curve: mode === "ecdf" ? "step" : "linear", markers: marks } satisfies LineSeries;
      }),
    [arms, arm, mode],
  );

  const yMaxKde = useMemo(() => Math.max(0.001, ...series.flatMap((s) => s.points.map((p) => p.y))), [series]);
  const fastest = [...arms].sort((a, b) => (a.latency.p50 ?? Infinity) - (b.latency.p50 ?? Infinity))[0];
  const slowest = [...arms].sort((a, b) => (b.latency.p50 ?? -Infinity) - (a.latency.p50 ?? -Infinity))[0];
  const worstTail = [...arms].sort((a, b) => (b.latency.p99 ?? -Infinity) - (a.latency.p99 ?? -Infinity))[0];

  const takeaway =
    fastest && slowest && fastest !== slowest ? (
      <>
        {arm(fastest.armId).label} is fastest at a median of <span className="num text-fg">{ms(fastest.latency.p50)}</span>{" "}
        {ci(fastest.latencyMedianCI.lo, fastest.latencyMedianCI.hi, ms)}; {arm(slowest.armId).label} is slowest at{" "}
        <span className="num text-fg">{ms(slowest.latency.p50)}</span>. The worst tail is {arm(worstTail.armId).label} (p99 {ms(worstTail.latency.p99)}).
      </>
    ) : fastest ? (
      <>Median latency {ms(fastest.latency.p50)}.</>
    ) : (
      "No successful calls with a latency."
    );

  return (
    <ReportSection
      id="latency"
      index={index}
      title="Latency"
      takeaway={takeaway}
      method={[METHOD.latency, METHOD.descriptive]}
      actions={
        <>
          {view === "chart" ? (
            <>
              <Segmented size="xs" label="Distribution view" value={mode} onChange={setMode} options={[{ value: "ecdf", label: "ECDF" }, { value: "kde", label: "Density" }]} />
              <Segmented size="xs" label="Latency axis scale" value={scale} onChange={setScale} options={[{ value: "linear", label: "Linear" }, { value: "log", label: "Log" }]} />
            </>
          ) : null}
          <Segmented size="xs" label="Latency view" value={view} onChange={setView} options={[{ value: "chart", label: "Chart" }, { value: "table", label: "Table" }]} />
        </>
      }
    >
      {view === "chart" ? (
        <>
          <LineChart
            series={series}
            ariaLabel={mode === "ecdf" ? "Cumulative distribution of end-to-end latency per arm" : "Density of end-to-end latency per arm"}
            description={arms.map((a) => `${arm(a.armId).label}: median ${ms(a.latency.p50)}, p90 ${ms(a.latency.p90)}, p99 ${ms(a.latency.p99)}`).join("; ")}
            height={300}
            x={{
              type: scale,
              domain: scale === "log" ? logDomain(xMin, xMax, 0.05) : niceDomain(0, xMax, 6),
              format: (v) => ms(v),
              label: "End-to-end latency",
            }}
            y={
              mode === "ecdf"
                ? { domain: [0, 1], format: (v) => `${Math.round(v * 100)}%`, label: "Share of requests at or below", ticks: [0, 0.25, 0.5, 0.75, 0.9, 1] }
                : { domain: [0, yMaxKde * 1.08], format: (v) => v.toFixed(v < 0.1 ? 3 : 2), label: "Density (per second)" }
            }
            formatValue={mode === "ecdf" ? (v) => `${(v * 100).toFixed(1)}%` : (v) => v.toFixed(3)}
            crosshairNote={mode === "ecdf" ? "Share of each arm's successful requests that finished by this time." : "Kernel density estimate (Silverman bandwidth)."}
          />
          <p className="mt-2 text-[11.5px] text-fg-subtle">
            Hollow markers: p50, p90 and p99 on each curve. {scale === "linear" ? "Axis ends just past the slowest arm's p99; the rare slower requests are in the table." : ""}
          </p>
          <h3 className="mt-6 mb-2 text-xs font-semibold text-fg">Medians with {L} bootstrap intervals</h3>
          <div className="grid gap-x-6 gap-y-5 xl:grid-cols-3">
            <MedianPlot title="Time to first token" arms={arms} get={(a) => [a.ttft, a.ttftMedianCI]} fmt={ms} why="no streamed first token" />
            <MedianPlot title="End-to-end latency" arms={arms} get={(a) => [a.latency, a.latencyMedianCI]} fmt={ms} why="no successful calls" />
            <MedianPlot title="Output speed" arms={arms} get={(a) => [a.outputTps, a.outputTpsMedianCI]} fmt={formatTps} axisFmt={(v) => `${Math.round(v)}`} axisLabel="tokens / s" why="no throughput measured" higherIsBetter />
          </div>
        </>
      ) : (
        <DataTable
          caption="Latency, TTFT and throughput by arm"
          rows={report.perArm}
          getKey={(a) => a.armId}
          minWidth={980}
          defaultSort={{ key: "lat", dir: "asc" }}
          columns={[
            { key: "arm", header: "Arm", render: (a) => <ArmLabel arm={arm(a.armId)} /> },
            { key: "ttft", header: "TTFT p50", align: "right", render: (a) => <Val v={a.ttft.p50} fmt={ms} reason="no first-token timing" />, sort: (a) => a.ttft.p50 },
            { key: "ttftci", header: `${L} CI`, align: "right", render: (a) => ci(a.ttftMedianCI.lo, a.ttftMedianCI.hi, ms) },
            { key: "lat", header: "Latency p50", align: "right", render: (a) => <Val v={a.latency.p50} fmt={ms} reason="no successful calls" />, sort: (a) => a.latency.p50 },
            { key: "latci", header: `${L} CI`, align: "right", render: (a) => ci(a.latencyMedianCI.lo, a.latencyMedianCI.hi, ms) },
            { key: "p90", header: "p90", align: "right", render: (a) => ms(a.latency.p90), sort: (a) => a.latency.p90 },
            { key: "p99", header: "p99", align: "right", render: (a) => ms(a.latency.p99), sort: (a) => a.latency.p99 },
            { key: "max", header: "max", align: "right", render: (a) => ms(a.latency.max), sort: (a) => a.latency.max },
            { key: "tps", header: "Output tok/s p50", align: "right", render: (a) => <Val v={a.outputTps.p50} fmt={formatTps} reason="no throughput measured" />, sort: (a) => a.outputTps.p50 },
            { key: "tpsci", header: `${L} CI`, align: "right", render: (a) => ci(a.outputTpsMedianCI.lo, a.outputTpsMedianCI.hi, formatTps) },
            { key: "n", header: "n ok", align: "right", render: (a) => a.latency.n, sort: (a) => a.latency.n },
          ]}
        />
      )}
    </ReportSection>
  );
}

function MedianPlot({
  title,
  arms,
  get,
  fmt,
  why,
  higherIsBetter,
  axisFmt,
  axisLabel,
}: {
  axisFmt?: (v: number) => string;
  axisLabel?: string;
  title: string;
  arms: ArmStats[];
  get: (a: ArmStats) => [Summary, Estimate];
  fmt: (v: number) => string;
  why: string;
  higherIsBetter?: boolean;
}) {
  const { arm, level } = useReportCtx();
  const rows: IntervalRow[] = arms
    .map((a) => {
      const [s, e] = get(a);
      const info = arm(a.armId);
      return {
        key: a.armId,
        label: info.label,
        color: info.color,
        hollowSwatch: info.simulated,
        value: e.value ?? s.p50,
        lo: e.lo,
        hi: e.hi,
        valueText: s.p50 != null ? fmt(s.p50) : "—",
        subText: s.p90 != null ? `p90 ${fmt(s.p90)}` : why,
        tip: (
          <div>
            <TipTitle>
              {info.label} · {title}
            </TipTitle>
            <TipRow color={info.color} label={`median ${ci(e.lo, e.hi, fmt)}`} value={s.p50 != null ? fmt(s.p50) : "—"} />
            <TipRow label="mean" value={s.mean != null ? fmt(s.mean) : "—"} shape="none" />
            <TipRow label="p90 / p99" value={`${s.p90 != null ? fmt(s.p90) : "—"} / ${s.p99 != null ? fmt(s.p99) : "—"}`} shape="none" />
            <TipNote>
              n = {s.n}. Median interval: {levelPct(level)} percentile bootstrap.
            </TipNote>
          </div>
        ),
      } satisfies IntervalRow;
    })
    .sort((a, b) => (higherIsBetter ? (b.value ?? -1) - (a.value ?? -1) : (a.value ?? Infinity) - (b.value ?? Infinity)));
  const vals = rows.flatMap((r) => [r.lo, r.hi, r.value]).filter((v): v is number => v != null);
  const domain: [number, number] = vals.length ? niceDomain(0, Math.max(...vals) * 1.05, 4) : [0, 1];
  return (
    <div className="min-w-0">
      <h4 className="mb-1 text-[11.5px] font-medium text-fg-muted">
        {title} <span className="text-fg-subtle">· {higherIsBetter ? "higher is better" : "lower is better"}</span>
      </h4>
      <IntervalPlot rows={rows} domain={domain} format={axisFmt ?? fmt} axisLabel={axisLabel} ariaLabel={`${title}: median per arm with intervals`} />
    </div>
  );
}
