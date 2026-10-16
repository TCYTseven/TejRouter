"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import type { DriftReport } from "@/lib/analysis/advanced";
import type { RunSummary } from "@/lib/bench/types";
import { fetchRun, fetchRuns } from "@/lib/client/bench";
import { formatDate } from "@/lib/client/format";
import { ms, num, pct, pp, pval, usd } from "./format";
import { ArmLabel, Panel, Term, useReportCtx } from "./section";

/** Re-run comparison: the same routers on the same tasks in an earlier saved run. */
export function DriftPanel() {
  const { run, arm } = useReportCtx();
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const [state, setState] = useState<{ status: "idle" } | { status: "loading" } | { status: "done"; drift: DriftReport } | { status: "error"; message: string }>({ status: "idle" });

  useEffect(() => {
    const ctl = new AbortController();
    fetchRuns(ctl.signal)
      .then(setRuns)
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setListError(e instanceof Error ? e.message : String(e));
      });
    return () => ctl.abort();
  }, []);

  const mine = useMemo(() => new Set(run.arms.map((a) => a.id)), [run.arms]);
  const candidates = useMemo(
    () =>
      (runs ?? [])
        .filter((r) => r.id !== run.id && r.arms.some((a) => mine.has(a.armId)))
        .sort((a, b) => b.createdAt - a.createdAt),
    [runs, run.id, mine],
  );
  const chosen = pick || candidates[0]?.id || "";

  const compare = async () => {
    if (!chosen) return;
    setState({ status: "loading" });
    try {
      const [{ compareRuns }, other] = await Promise.all([import("@/lib/analysis/advanced"), fetchRun(chosen)]);
      const [newer, older] = other.createdAt <= run.createdAt ? [run, other] : [other, run];
      const drift = compareRuns(newer, older);
      setState({ status: "done", drift });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <Panel
      id="adv-drift"
      title="Drift between runs"
      method="27. Advanced analysis"
      takeaway="Providers update models without notice, so the same router can score differently a week later. Pick an earlier run with the same routers; the comparison uses only the tasks both runs share, and tests the change in per-task results with McNemar's test."
    >
      {listError ? <p className="text-sm text-danger">Could not list saved runs: {listError}</p> : null}
      {runs && !candidates.length ? (
        <p className="text-sm text-fg-muted">No other saved run uses the same routers. Run this benchmark again in a few days, then come back here.</p>
      ) : null}
      {candidates.length ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[260px] flex-1 flex-col gap-1.5 text-[13px] text-fg-muted">
            Earlier or later run
            <Select value={chosen} onChange={(e) => setPick(e.target.value)}>
              {candidates.map((r) => (
                <option key={r.id} value={r.id}>
                  {formatDate(r.createdAt)} · {r.name}
                </option>
              ))}
            </Select>
          </label>
          <Button variant="secondary" onClick={() => void compare()} loading={state.status === "loading"}>
            Compare
          </Button>
        </div>
      ) : null}
      {state.status === "error" ? <p className="mt-3 text-sm text-danger">{state.message}</p> : null}
      {state.status === "done" ? (
        state.drift.reason ? (
          <p className="mt-4 text-sm text-fg-muted">{state.drift.reason}</p>
        ) : (
          <div className="mt-5">
            <p className="mb-3 text-sm text-fg-muted">
              {state.drift.daysApart < 1 ? "Less than a day apart" : `${num(state.drift.daysApart, 1)} days apart`} · {state.drift.sharedTasks} shared tasks · {state.drift.sharedArms} shared routers. Changes read newer minus older.
            </p>
            <DataTable
              caption="Change between runs"
              rows={state.drift.rows}
              getKey={(r) => r.armId}
              minWidth={1000}
              columns={[
                { key: "arm", header: "Router", render: (r) => <ArmLabel arm={arm(r.armId)} className="max-w-[220px]" /> },
                { key: "acc", header: "Accuracy, older → newer", align: "right", render: (r) => `${pct(r.accuracyThen)} → ${pct(r.accuracyNow)}` },
                { key: "d", header: "Change", align: "right", render: (r) => pp(r.delta), sort: (r) => r.delta },
                {
                  key: "p",
                  header: <Term tip="McNemar's exact test on tasks that flipped between right and wrong. Small values mean the change is unlikely to be chance.">p</Term>,
                  title: "p-value",
                  align: "right",
                  render: (r) => `${pval(r.pValue)} (${r.b} worse, ${r.c} better)`,
                  sort: (r) => r.pValue,
                },
                {
                  key: "js",
                  header: <Term tip="Jensen-Shannon divergence between the mixes of models used: 0 = the same mix, 1 = no model in common.">Model mix shift</Term>,
                  title: "Model mix shift",
                  align: "right",
                  render: (r) => num(r.modelShift),
                  sort: (r) => r.modelShift,
                },
                {
                  key: "top",
                  header: "Most-used model",
                  render: (r) => (
                    <span className="font-mono text-[13px]">
                      {r.topModelThen === r.topModelNow ? (r.topModelNow ?? "—") : `${r.topModelThen ?? "—"} → ${r.topModelNow ?? "—"}`}
                    </span>
                  ),
                },
                { key: "lat", header: "Median time", align: "right", render: (r) => `${ms(r.medianLatencyThen)} → ${ms(r.medianLatencyNow)}` },
                { key: "cost", header: "Cost per answer", align: "right", render: (r) => `${usd(r.meanCostThen)} → ${usd(r.meanCostNow)}` },
              ]}
            />
          </div>
        )
      ) : null}
    </Panel>
  );
}
