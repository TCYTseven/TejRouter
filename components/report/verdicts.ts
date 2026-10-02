import type { PairwiseStats, RunReport } from "@/lib/analysis/types";
import { levelPct, pEq, pct, pctNum, pp, times, usd, ms } from "./format";

/** A rich text fragment: plain text, an arm reference, or emphasized text. */
export type Part = string | { arm: string } | { b: string };

export interface Verdict {
  key: string;
  kind: "accuracy" | "cost" | "tie" | "routing" | "oracle" | "latency" | "reliability" | "info";
  tone: "positive" | "neutral" | "caution";
  parts: Part[];
}

/** Find the pairwise entry for (a, b) and orient it so diffs read as a − b. */
export function pairOf(report: RunReport, a: string, b: string): { p: PairwiseStats; sign: 1 | -1 } | null {
  for (const p of report.pairwise) {
    if (p.a === a && p.b === b) return { p, sign: 1 };
    if (p.a === b && p.b === a) return { p, sign: -1 };
  }
  return null;
}

const fin = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/**
 * Plain-English headline findings. Significance is claimed only when the
 * Holm-adjusted McNemar test says so (pairwise.significant); everything else
 * is described as a difference in point estimates with its uncertainty.
 */
export function buildVerdicts(report: RunReport): Verdict[] {
  const out: Verdict[] = [];
  const L = levelPct(report.options.level);
  const arms = report.perArm.filter((a) => a.n > 0 && fin(a.accuracy.value));
  const byAcc = [...arms].sort((a, b) => b.accuracy.value! - a.accuracy.value!);

  // 1. accuracy leader
  if (byAcc.length === 1) {
    const a = byAcc[0];
    out.push({ key: "acc", kind: "accuracy", tone: "neutral", parts: [{ arm: a.armId }, ` scored `, { b: pct(a.accuracy.value) }, accCI(a.accuracy.lo, a.accuracy.hi, L), ". Add a second arm to compare."] });
  } else if (byAcc.length >= 2) {
    const lead = byAcc[0];
    const second = byAcc[1];
    const pr = pairOf(report, lead.armId, second.armId);
    const beats = byAcc.slice(1).filter((o) => pairOf(report, lead.armId, o.armId)?.p.significant).length;
    const tiedTop = Math.abs(lead.accuracy.value! - second.accuracy.value!) < 1e-9;
    if (tiedTop) {
      out.push({ key: "acc", kind: "tie", tone: "neutral", parts: [{ arm: lead.armId }, " and ", { arm: second.armId }, " tie for the highest accuracy (", { b: pct(lead.accuracy.value) }, ")."] });
    } else if (pr?.p.significant) {
      const extra = beats > 1 ? `, and significantly better than ${beats} of the ${byAcc.length - 1} other arms` : "";
      out.push({
        key: "acc",
        kind: "accuracy",
        tone: "positive",
        parts: [{ arm: lead.armId }, " is the most accurate (", { b: pct(lead.accuracy.value) }, accCI(lead.accuracy.lo, lead.accuracy.hi, L, true), "), significantly better than the runner-up ", { arm: second.armId }, ` (${pp(pr.sign * (pr.p.meanDiff.value ?? NaN))}, Holm-adjusted McNemar ${pEq(pr.p.pAdjusted.mcnemarHolm)})${extra}.`],
      });
    } else {
      const holm = pr?.p.pAdjusted.mcnemarHolm;
      out.push({
        key: "acc",
        kind: "accuracy",
        tone: "neutral",
        parts: [
          { arm: lead.armId },
          " has the highest accuracy (",
          { b: pct(lead.accuracy.value) },
          accCI(lead.accuracy.lo, lead.accuracy.hi, L, true),
          "), but its lead over ",
          { arm: second.armId },
          ` (${pp(lead.accuracy.value! - second.accuracy.value!)}) is not statistically significant${fin(holm) ? ` (Holm-adjusted McNemar ${pEq(holm)})` : ""}.`,
          beats > 0 ? ` It does significantly beat ${beats} of the other ${byAcc.length - 1} arm${byAcc.length - 1 === 1 ? "" : "s"}.` : "",
        ],
      });
    }

    // 2. cost per correct answer
    if (!report.meta.hasCost) {
      out.push({ key: "cost", kind: "cost", tone: "caution", parts: ["No arm reported or estimated a cost, so cost and cost-per-correct comparisons are unavailable."] });
    } else {
      const withCpc = arms.filter((a) => fin(a.cost.costPerCorrect) && a.cost.costPerCorrect! > 0);
      const cheapest = [...withCpc].sort((a, b) => a.cost.costPerCorrect! - b.cost.costPerCorrect!)[0];
      if (cheapest) {
        if (cheapest.armId === lead.armId) {
          out.push({ key: "cost", kind: "cost", tone: "positive", parts: [{ arm: lead.armId }, " is also the cheapest per correct answer (", { b: usd(cheapest.cost.costPerCorrect) }, ")."] });
        } else if (fin(lead.cost.costPerCorrect)) {
          const ratio = lead.cost.costPerCorrect! / cheapest.cost.costPerCorrect!;
          out.push({
            key: "cost",
            kind: "cost",
            tone: "positive",
            parts: [
              { arm: cheapest.armId },
              " is ",
              { b: times(ratio) },
              " cheaper per correct answer than ",
              { arm: lead.armId },
              ` (${usd(cheapest.cost.costPerCorrect)} vs ${usd(lead.cost.costPerCorrect)}), at ${pp(cheapest.accuracy.value! - lead.accuracy.value!)} accuracy.`,
            ],
          });
        }
      }
    }

    // 3. a decision-relevant non-significant pair
    const nonSig = report.pairwise
      .filter((p) => !p.significant && fin(p.meanDiff.value))
      .map((p) => ({ p, score: (accOf(report, p.a) ?? 0) + (accOf(report, p.b) ?? 0) }))
      .sort((a, b) => b.score - a.score);
    const isLeadPair = (p: PairwiseStats) => (p.a === lead.armId && p.b === second.armId) || (p.b === lead.armId && p.a === second.armId);
    const tie = nonSig.find((x) => !isLeadPair(x.p))?.p;
    if (tie) {
      const [hi, lo] = (accOf(report, tie.a) ?? 0) >= (accOf(report, tie.b) ?? 0) ? [tie.a, tie.b] : [tie.b, tie.a];
      out.push({ key: "tie", kind: "tie", tone: "neutral", parts: tieParts(report, hi, lo, tie) });
    } else if (nonSig.length) {
      out.push({ key: "tie", kind: "tie", tone: "neutral", parts: powerParts(report, lead.armId, second.armId) });
    }
  }

  // 4. routing adaptivity
  const alpha = report.options.alpha;
  const routers = report.routing.filter((r) => r.kind === "router");
  const adaptive = routers
    .filter((r) => r.escalation && fin(r.escalation.slope) && fin(r.escalation.pSlope) && r.escalation.pSlope! < alpha && r.escalation.slope! > 0)
    .sort((a, b) => b.escalation!.slope! - a.escalation!.slope!)[0];
  if (adaptive?.escalation) {
    const e = adaptive.escalation;
    const first = e.curve[0];
    const last = e.curve[e.curve.length - 1];
    out.push({
      key: "route",
      kind: "routing",
      tone: "positive",
      parts: [
        { arm: adaptive.armId },
        " routes by difficulty: its modelled chance of escalating to a pricier model rises from ",
        { b: pct(first?.p, 0) },
        " on the easiest tasks to ",
        { b: pct(last?.p, 0) },
        ` on the hardest (slope ${e.slope!.toFixed(1)}${fin(e.slopeLo) && fin(e.slopeHi) ? `, ${L} CI ${e.slopeLo!.toFixed(1)} to ${e.slopeHi!.toFixed(1)}` : ""}, ${pEq(e.pSlope)}).`,
      ],
    });
  }
  const flat = routers.filter((r) => r.armId !== adaptive?.armId && r.escalation && fin(r.escalation.pSlope) && r.escalation.pSlope! >= alpha);
  if (flat.length) {
    const r = flat[0];
    out.push({
      key: "route-flat",
      kind: "routing",
      tone: "neutral",
      parts: [{ arm: r.armId }, ` shows no measurable link between task difficulty and the model it serves (escalation slope ${pEq(r.escalation!.pSlope)}): it sends ${pct(r.escalation!.rate, 0)} of requests to its pricier tier regardless of difficulty.`],
    });
  }
  const silent = routers.filter((r) => r.nWithModel === 0);
  if (silent.length) {
    out.push({ key: "route-silent", kind: "routing", tone: "caution", parts: [...joinArms(silent.map((r) => r.armId)), silent.length === 1 ? " does" : " do", " not report which model served each request, so routing behaviour cannot be analyzed for ", silent.length === 1 ? "it." : "them."] });
  }

  // 5. routing quality vs oracle
  const rq = report.routingQuality;
  if (rq.available && rq.routers.length && rq.bestFixed) {
    const best = [...rq.routers].filter((r) => fin(r.regretVsBestFixed.value)).sort((a, b) => a.regretVsBestFixed.value! - b.regretVsBestFixed.value!)[0];
    if (best) {
      const g = best.regretVsBestFixed;
      const sig = fin(g.lo) && fin(g.hi) ? (g.lo! > 0 ? "worse" : g.hi! < 0 ? "better" : "indistinguishable") : "unknown";
      const verdictText =
        sig === "worse"
          ? `, so it is reliably less accurate than always using `
          : sig === "better"
            ? `, so it reliably beats always using `
            : sig === "indistinguishable"
              ? `; the interval includes zero, so it is statistically indistinguishable from always using `
              : " versus always using ";
      out.push({
        key: "oracle",
        kind: "oracle",
        tone: sig === "worse" ? "caution" : "positive",
        parts: [
          "Best router vs baselines: ",
          { arm: best.armId },
          g.value! >= 0 ? " trails the best single model by " : " beats the best single model by ",
          { b: pp(Math.abs(g.value!)).replace("+", "") },
          `${fin(g.lo) && fin(g.hi) ? ` (${L} CI ${pctNum(g.lo!)} to ${pctNum(g.hi!)} pp)` : ""}${verdictText}`,
          { arm: rq.bestFixed.armId },
          fin(best.costSavingsVsBestFixed) ? `, while spending ${pct(Math.abs(best.costSavingsVsBestFixed!), 0)} ${best.costSavingsVsBestFixed! >= 0 ? "less" : "more"}.` : ".",
        ],
      });
    }
  }

  // 6. latency
  const byLat = arms.filter((a) => fin(a.latency.p50)).sort((a, b) => a.latency.p50! - b.latency.p50!);
  if (byLat.length >= 2) {
    const f = byLat[0];
    const s = byLat[byLat.length - 1];
    const pr = pairOf(report, f.armId, s.armId);
    out.push({
      key: "lat",
      kind: "latency",
      tone: "neutral",
      parts: [
        { arm: f.armId },
        " is the fastest (median ",
        { b: ms(f.latency.p50) },
        ") and ",
        { arm: s.armId },
        ` the slowest (${ms(s.latency.p50)})`,
        pr && fin(pr.p.pAdjusted.latencyHolm) ? `; ${pr.p.pAdjusted.latencyHolm! < alpha ? "the difference is significant" : "the difference is not significant"} (Wilcoxon, Holm ${pEq(pr.p.pAdjusted.latencyHolm)}).` : ".",
      ],
    });
  }

  // 7. reliability
  const flaky = arms.filter((a) => fin(a.errorRate.value) && a.errorRate.value! >= 0.05).sort((a, b) => b.errorRate.value! - a.errorRate.value!);
  if (flaky.length) {
    const a = flaky[0];
    out.push({ key: "err", kind: "reliability", tone: "caution", parts: [{ arm: a.armId }, " failed ", { b: pct(a.errorRate.value) }, ` of requests (${a.nErrors} of ${a.n})${flaky.length > 1 ? `; ${flaky.length - 1} other arm${flaky.length > 2 ? "s" : ""} also failed ≥ 5%` : ""}. Failed calls count as wrong in accuracy.`] });
  }
  return out;
}

function accOf(report: RunReport, id: string): number | null {
  return report.perArm.find((a) => a.armId === id)?.accuracy.value ?? null;
}

function accCI(lo: number | null, hi: number | null, L: string, inline = false): string {
  if (!fin(lo) || !fin(hi)) return "";
  return `${inline ? ", " : " ("}${L} CI ${pctNum(lo)}–${pctNum(hi)}${inline ? "" : ")"}`;
}

function tieParts(report: RunReport, hi: string, lo: string, p: PairwiseStats): Part[] {
  const sign = p.a === hi ? 1 : -1;
  const d = p.meanDiff.value != null ? sign * p.meanDiff.value : null;
  return [
    "No significant accuracy difference between ",
    { arm: hi },
    " and ",
    { arm: lo },
    ` (${pp(d)}, Holm-adjusted McNemar ${pEq(p.pAdjusted.mcnemarHolm)}).`,
    ...powerTail(report),
  ];
}

function powerParts(report: RunReport, hi: string, lo: string): Part[] {
  return ["Separating ", { arm: hi }, " from ", { arm: lo }, " needs more data.", ...powerTail(report)];
}

function powerTail(report: RunReport): Part[] {
  const n = report.power.tasksFor5pp.paired ?? report.power.tasksFor5pp.unpaired;
  const mde = report.power.mdePaired ?? report.power.mdeUnpaired;
  if (!fin(n)) return [];
  return [
    ` With ${report.power.nTasks} shared tasks this run can reliably detect differences of about ${mde != null ? pp(mde).replace("+", "") : "—"}; you'd need ~`,
    { b: n!.toLocaleString("en-US") },
    " tasks to detect 5 pp with 80% power.",
  ];
}

function joinArms(ids: string[]): Part[] {
  const out: Part[] = [];
  ids.forEach((id, i) => {
    if (i > 0) out.push(i === ids.length - 1 ? " and " : ", ");
    out.push({ arm: id });
  });
  return out;
}

