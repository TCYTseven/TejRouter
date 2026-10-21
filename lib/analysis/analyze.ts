import type { BenchArm, BenchRun, BenchSample } from "@/lib/bench/types";
import { lookupPrice } from "@/lib/pricing";
import { getProviderSpec } from "@/lib/providers/registry";
import {
  agreement,
  aiq as computeAiq,
  benjaminiHochberg,
  bestUnderBudget,
  betaDifference,
  betaInv,
  bootstrapIndices,
  bootstrapMean,
  bootstrapMedian,
  bradleyTerryBootstrap,
  cliffsDelta,
  deriveSeed,
  dominates,
  describe as describeStats,
  designEffect,
  dominanceRelations,
  ecdf,
  entropy,
  holmAdjust,
  hullQualityAt,
  jsDivergenceRecords,
  kde,
  logistic1d,
  max as arrMax,
  min as arrMin,
  mcnemar,
  mdePairedMeans,
  mdePairedProportions,
  mdeTwoProportions,
  median,
  mutualInformationLabels,
  nonDecreasingHull,
  normalizedEntropy,
  ols,
  onlineElo,
  paretoFrontier,
  permutationTestPaired,
  probGreater,
  requiredNPairedProportions,
  requiredNTwoProportions,
  sd,
  silvermanBandwidth,
  spearman,
  varianceDecomposition,
  wilcoxonSignedRank,
  wilson,
  type BootstrapResult,
  type BudgetChoice,
  type CQPoint,
  type PairwiseMatch,
} from "@/lib/stats";
import { computeTejScore } from "./tejscore";
import type {
  AnalyzeOptions,
  ArmBucketStats,
  ArmCategoryStats,
  ArmKind,
  ArmMeta,
  ArmStats,
  CellStats,
  ConsistencyStats,
  CostQualityReport,
  DifficultyBucket,
  DifficultyCurve,
  EscalationStats,
  Estimate,
  HindsightAtBudget,
  MIStats,
  ModelShare,
  PairwiseStats,
  PowerReport,
  RatingsReport,
  ResolvedOptions,
  RouterVsOracle,
  RoutingQuality,
  RoutingStats,
  RunMeta,
  RunReport,
  Summary,
} from "./types";

// ---------------------------------------------------------------- small helpers

/** Finite number or null. */
export function num(x: number | null | undefined): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

function est(value: number | null | undefined, lo: number | null | undefined, hi: number | null | undefined, method: string): Estimate {
  return { value: num(value), lo: num(lo), hi: num(hi), method };
}

const NULL_EST = (method: string): Estimate => ({ value: null, lo: null, hi: null, method });

function summary(xs: number[]): Summary {
  const d = describeStats(xs);
  return { n: d.n, mean: num(d.mean), sd: num(d.sd), min: num(d.min), max: num(d.max), p50: num(d.p50), p90: num(d.p90), p95: num(d.p95), p99: num(d.p99) };
}

function fromBoot(b: BootstrapResult, method: string, minUnits: number, units: number): Estimate {
  if (units < minUnits) return est(b.estimate, null, null, method);
  return est(b.estimate, b.lo, b.hi, method);
}

function avg(xs: number[]): number | null {
  if (xs.length === 0) return null;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Recursively replace non-finite numbers with null (safety net for JSON). */
function sanitize<T>(v: T): T {
  if (typeof v === "number") return (Number.isFinite(v) ? v : null) as T;
  if (Array.isArray(v)) return v.map(sanitize) as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = sanitize(x);
    return out as T;
  }
  return v;
}

/** Blended list price (3:1 input:output) in USD per 1M tokens. */
export function blendedPrice(model: string | null | undefined): number | null {
  const p = lookupPrice(model);
  return p ? (3 * p.input + p.output) / 4 : null;
}

// ---------------------------------------------------------------- internal data model

interface Obs {
  s: BenchSample;
  ok: boolean;
  score: number;
  correct: boolean;
  cost: number | null;
  model: string | null;
  price: number | null;
  bucket: number;
}

interface TaskCell {
  taskId: string;
  category: string;
  difficulty: number;
  bucket: number;
  obs: Obs[];
  meanScore: number;
  correctFrac: number;
  majorityCorrect: boolean;
  meanCost: number | null;
  medianLatency: number | null;
}

interface ArmData {
  meta: ArmMeta;
  obs: Obs[];
  cells: Map<string, TaskCell>;
  cellList: TaskCell[];
}

function bucketOf(d: number, k: number): number {
  const x = Number.isFinite(d) ? Math.min(1, Math.max(0, d)) : 0.5;
  return Math.min(k - 1, Math.floor(x * k));
}

function classifyArm(arm: BenchArm, obs: Obs[], opts: AnalyzeOptions): { kind: ArmKind; reason: string } {
  if (opts.routerArmIds?.includes(arm.id)) return { kind: "router", reason: "forced router by options" };
  if (opts.fixedArmIds?.includes(arm.id)) return { kind: "fixed", reason: "forced fixed baseline by options" };
  const model = arm.model?.trim();
  if (!model || model === "default") return { kind: "router", reason: "no pinned model: the router chooses" };
  const spec = getProviderSpec(arm.providerId);
  if ((spec?.autoModel && model === spec.autoModel) || spec?.routingModels?.includes(model) || /(^|[/:_-])auto$/i.test(model)) {
    return { kind: "router", reason: `auto-routing model id "${model}"` };
  }
  const counts = new Map<string, number>();
  for (const o of obs) if (o.model) counts.set(o.model, (counts.get(o.model) ?? 0) + 1);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const top = Math.max(0, ...counts.values());
  if (counts.size >= 2 && total > 0 && top / total < 0.95) {
    return { kind: "router", reason: `pinned "${model}" but served ${counts.size} models (top share ${(100 * top / total).toFixed(0)}%)` };
  }
  return { kind: "fixed", reason: `pinned model "${model}"` };
}

// ---------------------------------------------------------------- main entry

/**
 * Full statistical analysis of a benchmark run. Pure and deterministic for a
 * given (run, options) apart from `generatedAt`. See docs/METHODOLOGY.md.
 */
export function analyzeRun(run: BenchRun, opts: AnalyzeOptions = {}): RunReport {
  const level = opts.level ?? 0.95;
  const alpha = +(1 - level).toFixed(10);
  const B = Math.max(1, Math.floor(opts.bootstrapIterations ?? 1000));
  const K = Math.max(1, Math.floor(opts.difficultyBuckets ?? 4));
  const seed = (opts.seed ?? run.config?.seed ?? 1) >>> 0;
  const maxWork = opts.maxBootstrapWork ?? 2_000_000;
  const ecdfPoints = opts.ecdfPoints ?? 200;
  const kdePoints = opts.kdePoints ?? 80;
  const iters = (units: number) => (B <= 200 ? B : Math.min(B, Math.max(200, Math.floor(maxWork / Math.max(1, units)))));
  const sd0 = (label: string) => deriveSeed(seed, label);
  const warnings: string[] = [];
  const options: ResolvedOptions = { seed, bootstrapIterations: B, level, alpha, difficultyBuckets: K, maxBootstrapWork: maxWork };

  // ---- tasks
  const taskMeta = new Map<string, { id: string; suiteId: string; category: string; difficulty: number }>();
  for (const t of run.tasks ?? []) taskMeta.set(t.id, t);
  for (const s of run.samples ?? []) {
    if (!taskMeta.has(s.taskId)) taskMeta.set(s.taskId, { id: s.taskId, suiteId: s.suiteId, category: s.category, difficulty: s.difficulty });
  }

  // ---- arms (declared arms first, then any arm ids only seen in samples)
  const declared: BenchArm[] = [...(run.arms ?? [])];
  for (const s of run.samples ?? []) {
    if (!declared.some((a) => a.id === s.armId)) {
      declared.push({ id: s.armId, providerId: s.providerId, label: s.armId, color: "#888888" });
      warnings.push(`Arm "${s.armId}" appears in samples but not in run.arms; added with default label.`);
    }
  }

  const obsByArm = new Map<string, Obs[]>(declared.map((a) => [a.id, []]));
  for (const s of run.samples ?? []) {
    const r = s.result;
    const ok = !!r?.ok;
    const rawScore = Number(s.grade?.score);
    const score = ok && Number.isFinite(rawScore) ? Math.min(1, Math.max(0, rawScore)) : 0;
    const cost = num(r?.costUsd);
    const model = ok ? (r?.servedModel ?? null) : null;
    const t = taskMeta.get(s.taskId)!;
    obsByArm.get(s.armId)!.push({
      s,
      ok,
      score,
      correct: ok && !!s.grade?.correct,
      cost: cost != null && cost >= 0 ? cost : null,
      model,
      price: blendedPrice(model),
      bucket: bucketOf(t.difficulty, K),
    });
  }

  const arms: ArmData[] = declared.map((a) => {
    const obs = obsByArm.get(a.id)!;
    const { kind, reason } = classifyArm(a, obs, opts);
    const cells = new Map<string, TaskCell>();
    for (const o of obs) {
      let c = cells.get(o.s.taskId);
      if (!c) {
        const t = taskMeta.get(o.s.taskId)!;
        c = { taskId: t.id, category: t.category, difficulty: t.difficulty, bucket: bucketOf(t.difficulty, K), obs: [], meanScore: 0, correctFrac: 0, majorityCorrect: false, meanCost: null, medianLatency: null };
        cells.set(o.s.taskId, c);
      }
      c.obs.push(o);
    }
    for (const c of cells.values()) {
      c.meanScore = avg(c.obs.map((o) => o.score)) ?? 0;
      c.correctFrac = avg(c.obs.map((o) => (o.correct ? 1 : 0))) ?? 0;
      c.majorityCorrect = c.correctFrac > 0.5;
      c.meanCost = avg(c.obs.map((o) => o.cost).filter((x): x is number => x != null));
      const lats = c.obs.filter((o) => o.ok && Number.isFinite(o.s.result.latencyMs)).map((o) => o.s.result.latencyMs);
      c.medianLatency = lats.length ? median(lats) : null;
    }
    return {
      meta: { id: a.id, label: a.label ?? a.id, color: a.color ?? "#888888", providerId: a.providerId, model: a.model ?? null, kind, kindReason: reason },
      obs,
      cells,
      cellList: [...cells.values()],
    };
  });

  // ---- meta
  const categories = new Map<string, number>();
  for (const t of taskMeta.values()) categories.set(t.category, (categories.get(t.category) ?? 0) + 1);
  const buckets: DifficultyBucket[] = Array.from({ length: K }, (_, i) => ({
    index: i,
    lo: i / K,
    hi: (i + 1) / K,
    label: `${(i / K).toFixed(2)}–${((i + 1) / K).toFixed(2)}`,
    nTasks: [...taskMeta.values()].filter((t) => bucketOf(t.difficulty, K) === i).length,
  }));
  const repCounts = arms.flatMap((a) => a.cellList.map((c) => c.obs.length));
  const starts = (run.samples ?? []).map((s) => s.result?.startedAt).filter((x): x is number => Number.isFinite(x));
  const ends = (run.samples ?? []).map((s) => (s.result?.startedAt ?? NaN) + (s.result?.latencyMs ?? NaN)).filter((x) => Number.isFinite(x));
  const durationMs =
    run.finishedAt != null && Number.isFinite(run.finishedAt) && Number.isFinite(run.createdAt)
      ? run.finishedAt - run.createdAt
      : starts.length && ends.length
        ? arrMax(ends) - arrMin(starts)
        : null;
  const hasCost = arms.some((a) => a.obs.some((o) => o.cost != null));
  const meta: RunMeta = {
    runId: run.id,
    name: run.name,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt ?? null,
    durationMs: num(durationMs),
    nSamples: (run.samples ?? []).length,
    nTasks: taskMeta.size,
    nArms: arms.length,
    repetitions: run.config?.repetitions ?? (repCounts.length ? arrMax(repCounts) : 0),
    repsObserved: { min: repCounts.length ? arrMin(repCounts) : 0, max: repCounts.length ? arrMax(repCounts) : 0 },
    arms: arms.map((a) => a.meta),
    categories: [...categories.entries()].map(([name, nTasks]) => ({ name, nTasks })).sort((a, b) => a.name.localeCompare(b.name)),
    suites: [...new Set([...taskMeta.values()].map((t) => t.suiteId))],
    difficultyBuckets: buckets,
    hasCost,
    hasBaselines: arms.some((a) => a.meta.kind === "fixed" && a.obs.length > 0),
  };
  if (!hasCost) warnings.push("No sample has a cost (reported or estimated): cost metrics are null.");
  for (const a of arms) if (a.obs.length === 0) warnings.push(`Arm "${a.meta.id}" has no samples.`);

  // ---- consistency first (its ICC feeds the design effect used by Bayesian posteriors)
  const consistency: ConsistencyStats[] = arms.map((a) => {
    const groups = a.cellList.map((c) => c.obs);
    const maxReps = groups.reduce((m, g) => Math.max(m, g.length), 0);
    const withReps = groups.filter((g) => g.length >= 2);
    if (maxReps < 2) {
      return { armId: a.meta.id, maxReps, tasksWithReps: 0, correctAgreement: null, correctUnanimous: null, correctKappa: null, answerAgreement: null, routingAgreement: null, icc: null, iccMean: null, varBetween: null, varWithin: null, fractionWithin: null, designEffect: null };
    }
    const corr = agreement(withReps.map((g) => g.map((o) => o.correct)));
    const ans = agreement(withReps.map((g) => g.map((o) => o.s.grade?.extracted).filter((x): x is string => x != null)));
    const route = agreement(withReps.map((g) => g.map((o) => o.model).filter((x): x is string => x != null)));
    const vd = varianceDecomposition(groups.map((g) => g.map((o) => o.score)));
    const meanReps = avg(groups.map((g) => g.length)) ?? 1;
    return {
      armId: a.meta.id,
      maxReps,
      tasksWithReps: withReps.length,
      correctAgreement: num(corr.pairwise),
      correctUnanimous: num(corr.unanimous),
      correctKappa: num(corr.kappa),
      answerAgreement: num(ans.pairwise),
      routingAgreement: num(route.pairwise),
      icc: num(vd.icc),
      iccMean: num(vd.iccMean),
      varBetween: num(vd.varBetween),
      varWithin: num(vd.varWithin),
      fractionWithin: num(vd.fractionWithin),
      designEffect: num(designEffect(meanReps, Number.isFinite(vd.icc) ? vd.icc : 0)),
    };
  });
  if (meta.repsObserved.max < 2) warnings.push("Only one repetition per task: consistency, ICC and design effects are unavailable.");
  const deffOf = (armId: string) => consistency.find((c) => c.armId === armId)?.designEffect ?? 1;

  // ---- routing (before per-bucket stats, which use the escalation threshold)
  const thresholds = new Map<string, number>();
  const routing: RoutingStats[] = arms.map((a) => {
    const withModel = a.obs.filter((o) => o.model != null);
    const shares = (os: Obs[]): ModelShare[] => {
      const m = new Map<string, number>();
      for (const o of os) if (o.model) m.set(o.model, (m.get(o.model) ?? 0) + 1);
      const n = os.filter((o) => o.model).length;
      return [...m.entries()]
        .map(([model, count]) => ({ model, count, share: n ? count / n : 0, blendedPrice: blendedPrice(model) }))
        .sort((x, y) => y.count - x.count || x.model.localeCompare(y.model));
    };
    const models = shares(withModel);
    const byCategory = [...new Set(withModel.map((o) => o.s.category))].sort().map((category) => {
      const os = withModel.filter((o) => o.s.category === category);
      return { category, n: os.length, models: shares(os) };
    });
    const byDifficulty = buckets.map((b) => {
      const os = withModel.filter((o) => o.bucket === b.index);
      return { bucket: b.index, label: b.label, n: os.length, models: shares(os) };
    });
    const counts = models.map((m) => m.count);
    const miOf = (xs: string[]): MIStats | null => {
      if (withModel.length < 2) return null;
      const r = mutualInformationLabels(xs, withModel.map((o) => o.model!));
      return { mi: r.mi, nmi: r.nmiSqrt, uncertainty: r.uncertaintyYgivenX, miCorrected: r.miCorrected, g: r.g, df: r.df, pValue: r.pValue, n: r.n };
    };
    const nonEmpty = byDifficulty.filter((b) => b.n > 0);
    const easyHardJsd =
      nonEmpty.length >= 2
        ? {
            value: jsDivergenceRecords(
              Object.fromEntries(nonEmpty[0].models.map((m) => [m.model, m.count])),
              Object.fromEntries(nonEmpty[nonEmpty.length - 1].models.map((m) => [m.model, m.count])),
            ),
            easyBucket: nonEmpty[0].bucket,
            hardBucket: nonEmpty[nonEmpty.length - 1].bucket,
          }
        : null;

    // Escalation: P(served price > median of distinct served prices | difficulty)
    let escalation: EscalationStats | null = null;
    let escalationReason: string | null = null;
    const priced = withModel.filter((o) => o.price != null);
    const distinct = [...new Set(priced.map((o) => o.price!))].sort((x, y) => x - y);
    const distinctD = new Set(priced.map((o) => o.s.difficulty)).size;
    if (withModel.length === 0) escalationReason = "no served-model information";
    else if (distinct.length < 2) escalationReason = priced.length ? "only one price tier served" : "served models have no known price";
    else if (distinctD < 2) escalationReason = "all tasks have the same difficulty";
    else {
      const threshold = median(distinct, true);
      thresholds.set(a.meta.id, threshold);
      const x = priced.map((o) => o.s.difficulty);
      const y = priced.map((o) => (o.price! > threshold ? 1 : 0));
      const agg = aggregateBinary(x, y);
      const fit = logistic1d(agg.x, agg.y, { weights: agg.w, from: 0, to: 1, points: 21, level });
      const lp = ols(x, priced.map((o) => Math.log(o.price!)));
      const nEsc = y.reduce((s: number, v) => s + v, 0);
      escalation = {
        threshold,
        definition: "escalated = blended price of served model > median of the distinct prices this arm served",
        n: priced.length,
        nEscalated: nEsc,
        rate: nEsc / priced.length,
        intercept: num(fit.intercept),
        slope: num(fit.slope),
        slopeLo: num(fit.slopeLo),
        slopeHi: num(fit.slopeHi),
        pSlope: num(fit.pSlope),
        curve: fit.curve.filter((c) => [c.p, c.lo, c.hi].every(Number.isFinite)),
        logPriceSlope: num(lp.slope),
        spearman: num(spearman(x, priced.map((o) => o.price!))),
      };
    }
    if (a.obs.length > withModel.length && a.obs.some((o) => o.ok && o.model == null)) {
      warnings.push(`Arm "${a.meta.id}": some successful responses did not report a served model.`);
    }
    return {
      armId: a.meta.id,
      kind: a.meta.kind,
      nWithModel: withModel.length,
      nUnknownModel: a.obs.filter((o) => o.ok && o.model == null).length,
      nErrored: a.obs.filter((o) => !o.ok).length,
      distinctModels: models.length,
      models,
      byCategory,
      byDifficulty,
      entropyBits: counts.length ? entropy(counts) : null,
      normalizedEntropy: counts.length ? normalizedEntropy(counts) : null,
      categoryMI: miOf(withModel.map((o) => o.s.category)),
      difficultyMI: miOf(withModel.map((o) => String(o.bucket))),
      easyHardJsd,
      escalation,
      escalationReason,
      adaptivity: escalation?.slope ?? null,
    };
  });

  // ---- per arm
  const perArm: ArmStats[] = arms.map((a) => armStats(a));

  function armStats(a: ArmData): ArmStats {
    const id = a.meta.id;
    const n = a.obs.length;
    const nOk = a.obs.filter((o) => o.ok).length;
    const nCorrect = a.obs.filter((o) => o.correct).length;
    const taskMeans = a.cellList.map((c) => c.meanScore);
    const accBoot = bootstrapIndices(
      taskMeans.length,
      (idx) => {
        let s = 0;
        for (const i of idx) s += taskMeans[i];
        return s / idx.length;
      },
      { iterations: iters(taskMeans.length), seed: sd0(`acc|${id}`), alpha, method: "bca" },
    );
    const okObs = a.obs.filter((o) => o.ok);
    const lat = okObs.map((o) => o.s.result.latencyMs).filter((x) => Number.isFinite(x) && x >= 0);
    const ttft = okObs.map((o) => o.s.result.ttftMs).filter((x): x is number => x != null && Number.isFinite(x) && x >= 0);
    const tps = okObs.map((o) => o.s.result.outputTps).filter((x): x is number => x != null && Number.isFinite(x) && x > 0);
    const medCI = (xs: number[], label: string): Estimate => {
      if (xs.length === 0) return NULL_EST("bootstrap-percentile");
      const b = bootstrapMedian(xs, { iterations: iters(xs.length * 8), seed: sd0(`${label}|${id}`), alpha });
      return fromBoot(b, "bootstrap-percentile", 2, xs.length);
    };
    const h = lat.length >= 2 ? silvermanBandwidth(lat) : 1;
    const latencyKde = lat.length >= 2 ? kde(lat, { points: kdePoints, bandwidth: h, from: Math.max(0, arrMin(lat) - 3 * h), to: arrMax(lat) + 3 * h }) : [];

    // cost
    const withCost = a.obs.filter((o) => o.cost != null);
    const taskCosts = a.cellList.map((c) => c.meanCost).filter((x): x is number => x != null);
    const meanUsd = avg(taskCosts);
    const costBoot = taskCosts.length ? bootstrapMean(taskCosts, { iterations: iters(taskCosts.length), seed: sd0(`cost|${id}`), alpha }) : null;
    const totalUsd = withCost.length ? withCost.reduce((s, o) => s + o.cost!, 0) : null;
    const correctWithCost = withCost.filter((o) => o.correct).length;
    const accuracy = n ? accBoot.estimate : null;

    // tokens
    const withUsage = a.obs.filter((o) => o.s.result?.usage && (o.s.result.usage.totalTokens != null || o.s.result.usage.completionTokens != null));
    const tok = (f: (o: Obs) => number | null | undefined) => {
      const xs = withUsage.map(f).filter((x): x is number => x != null && Number.isFinite(x));
      return xs.length ? { total: xs.reduce((s, x) => s + x, 0), mean: avg(xs) } : { total: null, mean: null };
    };
    const pt = tok((o) => o.s.result.usage.promptTokens);
    const ct = tok((o) => o.s.result.usage.completionTokens);
    const tt = tok((o) => o.s.result.usage.totalTokens ?? ((o.s.result.usage.promptTokens ?? NaN) + (o.s.result.usage.completionTokens ?? NaN)));
    const rt = tok((o) => o.s.result.usage.reasoningTokens);

    // Bayesian posterior on correctness, counts deflated by the design effect
    const deff = deffOf(id);
    const nEff = n / deff;
    const pa = 1 + nCorrect / deff;
    const pb = 1 + (n - nCorrect) / deff;
    const err = wilson(n - nOk, n, level);
    const cr = wilson(nCorrect, n, level);

    return {
      armId: id,
      label: a.meta.label,
      color: a.meta.color,
      kind: a.meta.kind,
      n,
      nTasks: a.cellList.length,
      nOk,
      nErrors: n - nOk,
      errorRate: n ? est(err.estimate, err.lo, err.hi, "wilson") : NULL_EST("wilson"),
      accuracy: n ? fromBoot(accBoot, "cluster-bootstrap-bca", 2, taskMeans.length) : NULL_EST("cluster-bootstrap-bca"),
      accuracyOk: avg(okObs.map((o) => o.score)),
      correctRate: n ? est(cr.estimate, cr.lo, cr.hi, "wilson") : NULL_EST("wilson"),
      nCorrect,
      accuracyPosterior: {
        alpha: pa,
        beta: pb,
        mean: n ? pa / (pa + pb) : null,
        lo: n ? num(betaInv(alpha / 2, pa, pb)) : null,
        hi: n ? num(betaInv(1 - alpha / 2, pa, pb)) : null,
        effectiveN: n ? num(nEff) : null,
      },
      latency: summary(lat),
      latencyMedianCI: medCI(lat, "lat"),
      latencyEcdf: ecdf(lat, ecdfPoints),
      latencyKde,
      ttft: summary(ttft),
      ttftMedianCI: medCI(ttft, "ttft"),
      outputTps: summary(tps),
      outputTpsMedianCI: medCI(tps, "tps"),
      cost: {
        totalUsd: num(totalUsd),
        meanUsd: num(meanUsd),
        meanUsdCI: costBoot ? fromBoot(costBoot, "cluster-bootstrap-percentile", 2, taskCosts.length) : NULL_EST("cluster-bootstrap-percentile"),
        nWithCost: withCost.length,
        nReported: a.obs.filter((o) => o.cost != null && o.s.result.costSource === "reported").length,
        nEstimated: a.obs.filter((o) => o.cost != null && o.s.result.costSource !== "reported").length,
        nMissing: n - withCost.length,
        reportedUsd: withCost.filter((o) => o.s.result.costSource === "reported").reduce((s, o) => s + o.cost!, 0),
        estimatedUsd: withCost.filter((o) => o.s.result.costSource !== "reported").reduce((s, o) => s + o.cost!, 0),
        coverage: n ? withCost.length / n : 0,
        costPerCorrect: totalUsd != null && correctWithCost > 0 ? totalUsd / correctWithCost : null,
        accuracyPerDollar: accuracy != null && meanUsd != null && meanUsd > 0 ? accuracy / meanUsd : null,
        correctPerDollar: totalUsd != null && totalUsd > 0 ? correctWithCost / totalUsd : null,
      },
      tokens: {
        nWithUsage: withUsage.length,
        promptTotal: num(pt.total),
        completionTotal: num(ct.total),
        totalTotal: num(tt.total),
        reasoningTotal: num(rt.total),
        promptMean: num(pt.mean),
        completionMean: num(ct.mean),
        totalMean: num(tt.mean),
      },
    };
  }

  // ---- cells by category / difficulty bucket
  function cellStats(armId: string, cells: TaskCell[], label: string): CellStats {
    const means = cells.map((c) => c.meanScore);
    const obs = cells.flatMap((c) => c.obs);
    const nCorrect = obs.filter((o) => o.correct).length;
    const boot = means.length ? bootstrapMean(means, { iterations: iters(means.length), seed: sd0(`cell|${armId}|${label}`), alpha }) : null;
    const cr = wilson(nCorrect, obs.length, level);
    const lats = obs.filter((o) => o.ok && Number.isFinite(o.s.result.latencyMs)).map((o) => o.s.result.latencyMs);
    return {
      armId,
      nTasks: cells.length,
      nSamples: obs.length,
      accuracy: cellAccuracy(boot, means),
      correctRate: obs.length ? est(cr.estimate, cr.lo, cr.hi, "wilson") : NULL_EST("wilson"),
      meanCostUsd: avg(cells.map((c) => c.meanCost).filter((x): x is number => x != null)),
      medianLatencyMs: lats.length ? median(lats) : null,
    };
  }

  // A percentile bootstrap collapses to a zero-width interval when every task in a
  // small cell has the same score (all right, all wrong). Fall back to a Wilson
  // interval on the task-mean scores so the uncertainty stays visible.
  function cellAccuracy(boot: BootstrapResult | null, means: number[]): Estimate {
    if (!boot) return NULL_EST("cluster-bootstrap-percentile");
    if (means.length >= 2 && boot.lo != null && boot.hi != null && boot.hi - boot.lo < 1e-12) {
      const w = wilson(means.reduce((acc, x) => acc + x, 0), means.length, level);
      return est(boot.estimate, w.lo, w.hi, "wilson-task-means");
    }
    return fromBoot(boot, "cluster-bootstrap-percentile", 2, means.length);
  }

  const perArmCategory: ArmCategoryStats[] = [];
  const perArmDifficultyBucket: ArmBucketStats[] = [];
  for (const a of arms) {
    for (const { name } of meta.categories) {
      const cells = a.cellList.filter((c) => c.category === name);
      if (cells.length) perArmCategory.push({ category: name, ...cellStats(a.meta.id, cells, `cat:${name}`) });
    }
    const thr = thresholds.get(a.meta.id);
    for (const b of buckets) {
      const cells = a.cellList.filter((c) => c.bucket === b.index);
      if (!cells.length) continue;
      const priced = cells.flatMap((c) => c.obs).filter((o) => o.price != null);
      perArmDifficultyBucket.push({
        bucket: b.index,
        label: b.label,
        lo: b.lo,
        hi: b.hi,
        meanDifficulty: avg(cells.map((c) => c.difficulty)),
        escalationRate: thr != null && priced.length ? priced.filter((o) => o.price! > thr).length / priced.length : null,
        ...cellStats(a.meta.id, cells, `bucket:${b.index}`),
      });
    }
  }

  // ---- P(correct | difficulty)
  const difficultyCurves: DifficultyCurve[] = arms.map((a) => {
    const x = a.obs.map((o) => o.s.difficulty).filter(Number.isFinite);
    const y = a.obs.filter((o) => Number.isFinite(o.s.difficulty)).map((o) => (o.correct ? 1 : 0));
    const empty: DifficultyCurve = { armId: a.meta.id, n: x.length, intercept: null, slope: null, slopeLo: null, slopeHi: null, pSlope: null, oddsRatio: null, curve: [] };
    if (x.length < 3 || new Set(x).size < 2) return empty;
    const agg = aggregateBinary(x, y);
    const fit = logistic1d(agg.x, agg.y, { weights: agg.w, from: 0, to: 1, points: 21, level });
    return {
      armId: a.meta.id,
      n: x.length,
      intercept: num(fit.intercept),
      slope: num(fit.slope),
      slopeLo: num(fit.slopeLo),
      slopeHi: num(fit.slopeHi),
      pSlope: num(fit.pSlope),
      oddsRatio: num(fit.oddsRatio),
      curve: fit.curve.filter((c) => [c.p, c.lo, c.hi].every(Number.isFinite)),
    };
  });

  // ---- cost-quality
  const costQuality = costQualityReport(perArm, arms);

  // ---- routing quality vs oracle / best fixed
  const routingQuality = routingQualityReport(arms, perArm, costQuality);
  if (!routingQuality.available && routingQuality.reason) warnings.push(routingQuality.reason);

  // ---- pairwise
  const pairwise: PairwiseStats[] = [];
  const pairDiffSds: number[] = [];
  const discordances: number[] = [];
  for (let i = 0; i < arms.length; i++) {
    for (let j = i + 1; j < arms.length; j++) {
      const A = arms[i];
      const Bm = arms[j];
      const shared = A.cellList.filter((c) => Bm.cells.has(c.taskId)).map((c) => [c, Bm.cells.get(c.taskId)!] as const);
      const sa = shared.map(([x]) => x.meanScore);
      const sb = shared.map(([, y]) => y.meanScore);
      const diffs = sa.map((v, k) => v - sb[k]);
      const label = `${A.meta.id}|${Bm.meta.id}`;
      const boot = diffs.length
        ? bootstrapMean(diffs, { iterations: iters(diffs.length), seed: sd0(`pair|${label}`), alpha, method: "bca" })
        : null;
      const perm = diffs.length ? permutationTestPaired(sa, sb, { iterations: B, seed: sd0(`perm|${label}`) }) : null;
      let mb = 0;
      let mc = 0;
      let wins = 0;
      let ties = 0;
      let losses = 0;
      for (const [x, y] of shared) {
        if (x.majorityCorrect && !y.majorityCorrect) mb++;
        else if (!x.majorityCorrect && y.majorityCorrect) mc++;
        const d = x.meanScore - y.meanScore;
        if (d > 1e-12) wins++;
        else if (d < -1e-12) losses++;
        else ties++;
      }
      const mn = shared.length ? mcnemar(mb, mc) : null;
      if (shared.length) discordances.push((mb + mc) / shared.length);
      if (diffs.length >= 2) pairDiffSds.push(sd(diffs));
      // Bayesian comparison on the shared tasks
      const oa = shared.flatMap(([x]) => x.obs);
      const ob = shared.flatMap(([, y]) => y.obs);
      let pAB: number | null = null;
      let cred: { mean: number | null; lo: number | null; hi: number | null } = { mean: null, lo: null, hi: null };
      if (oa.length && ob.length) {
        const da = deffOf(A.meta.id);
        const db = deffOf(Bm.meta.id);
        const ca = oa.filter((o) => o.correct).length;
        const cb = ob.filter((o) => o.correct).length;
        const a1 = 1 + ca / da;
        const b1 = 1 + (oa.length - ca) / da;
        const a2 = 1 + cb / db;
        const b2 = 1 + (ob.length - cb) / db;
        pAB = num(probGreater(a1, b1, a2, b2));
        const bd = betaDifference(a1, b1, a2, b2, { draws: 10000, seed: sd0(`bayes|${label}`), level });
        cred = { mean: num(bd.mean), lo: num(bd.lo), hi: num(bd.hi) };
      }
      // latency
      const latPairs = shared.filter(([x, y]) => x.medianLatency != null && y.medianLatency != null);
      const la = latPairs.map(([x]) => x.medianLatency!);
      const lb = latPairs.map(([, y]) => y.medianLatency!);
      const wil = latPairs.length ? wilcoxonSignedRank(la, lb) : null;
      const allLa = A.obs.filter((o) => o.ok).map((o) => o.s.result.latencyMs).filter(Number.isFinite);
      const allLb = Bm.obs.filter((o) => o.ok).map((o) => o.s.result.latencyMs).filter(Number.isFinite);
      const cd = allLa.length && allLb.length ? cliffsDelta(allLa, allLb, level) : null;
      const costPairs = shared.filter(([x, y]) => x.meanCost != null && y.meanCost != null);
      pairwise.push({
        a: A.meta.id,
        b: Bm.meta.id,
        nSharedTasks: shared.length,
        meanDiff: boot ? fromBoot(boot, "paired-cluster-bootstrap-bca", 2, diffs.length) : NULL_EST("paired-cluster-bootstrap-bca"),
        permutationP: perm ? num(perm.pValue) : null,
        mcnemar: { b: mb, c: mc, pExact: mn ? num(mn.pExact) : null, pMid: mn ? num(mn.pMid) : null, pChiSquare: mn ? num(mn.pChiSquare) : null },
        wins,
        ties,
        losses,
        pAGreaterB: pAB,
        diffCredible: cred,
        latency: {
          nPairs: latPairs.length,
          medianDiffMs: latPairs.length ? median(la.map((v, k) => v - lb[k])) : null,
          wilcoxonP: wil ? num(wil.pValue) : null,
          cliffsDelta: cd ? num(cd.estimate) : null,
          cliffsLo: cd ? num(cd.lo) : null,
          cliffsHi: cd ? num(cd.hi) : null,
          magnitude: cd ? cd.magnitude : "undefined",
        },
        meanCostDiffUsd: avg(costPairs.map(([x, y]) => x.meanCost! - y.meanCost!)),
        pAdjusted: { mcnemarHolm: null, mcnemarBH: null, permutationHolm: null, latencyHolm: null },
        significant: false,
      });
    }
  }
  const adjust = (get: (p: PairwiseStats) => number | null, f: (ps: number[]) => number[]) => f(pairwise.map((p) => get(p) ?? NaN)).map(num);
  const mH = adjust((p) => p.mcnemar.pExact, holmAdjust);
  const mBH = adjust((p) => p.mcnemar.pExact, benjaminiHochberg);
  const pH = adjust((p) => p.permutationP, holmAdjust);
  const lH = adjust((p) => p.latency.wilcoxonP, holmAdjust);
  pairwise.forEach((p, k) => {
    p.pAdjusted = { mcnemarHolm: mH[k], mcnemarBH: mBH[k], permutationHolm: pH[k], latencyHolm: lH[k] };
    p.significant = mH[k] != null && mH[k]! < alpha;
  });
  if (arms.length < 2) warnings.push("Only one arm: pairwise comparisons and ratings are not available.");

  // ---- ratings
  const ratings = ratingsReport(arms);

  // ---- power
  const power = powerReport(arms, perArm, discordances, pairDiffSds);

  const partial = { perArm };
  const tejScore = computeTejScore(partial, opts.tejWeights);

  const report: RunReport = {
    version: 1,
    generatedAt: opts.now ?? Date.now(),
    options,
    meta,
    perArm,
    perArmCategory,
    perArmDifficultyBucket,
    difficultyCurves,
    routing,
    routingQuality,
    pairwise,
    ratings,
    costQuality,
    tejScore,
    power,
    consistency,
    warnings: [...new Set(warnings)],
  };
  return sanitize(report);

  // ================================================================ nested helpers

  function costQualityReport(stats: ArmStats[], data: ArmData[]): CostQualityReport {
    const pts: CQPoint[] = stats
      .filter((s) => s.cost.meanUsd != null && s.accuracy.value != null)
      .map((s) => ({ id: s.armId, cost: s.cost.meanUsd!, quality: s.accuracy.value! }));
    const dom = dominanceRelations(pts);
    const frontier = paretoFrontier(pts).map((p) => p.id);
    const lin = computeAiq(pts);
    const lg = computeAiq(pts, { scale: "log" });
    const fixedIds = new Set(data.filter((d) => d.meta.kind === "fixed").map((d) => d.meta.id));
    const basePts = pts.filter((p) => fixedIds.has(p.id));
    const baseHull = nonDecreasingHull(basePts);
    const baseAiq = basePts.length ? computeAiq(basePts) : null;
    return {
      points: stats.map((s) => {
        const d = dom.find((x) => x.id === s.armId);
        return {
          armId: s.armId,
          kind: s.kind,
          costUsd: s.cost.meanUsd,
          costLo: s.cost.meanUsdCI.lo,
          costHi: s.cost.meanUsdCI.hi,
          quality: s.accuracy.value,
          qualityLo: s.accuracy.lo,
          qualityHi: s.accuracy.hi,
          onFrontier: d ? d.onFrontier : false,
          dominatedBy: d ? d.dominatedBy : [],
        };
      }),
      frontier,
      hull: lin.hull.map((p) => p.id),
      aiq: num(lin.aiq),
      aiqLogCost: num(lg.aiq),
      costRange: { min: num(lin.cMin), max: num(lin.cMax) },
      baselineHull: baseHull.map((p) => p.id),
      baselineAiq: baseAiq ? num(baseAiq.aiq) : null,
      gainOverBaselineHull: stats.map((s) => ({
        armId: s.armId,
        gain:
          s.kind === "router" && s.cost.meanUsd != null && s.accuracy.value != null && baseHull.length
            ? num(s.accuracy.value - hullQualityAt(baseHull, s.cost.meanUsd))
            : null,
      })),
    };
  }

  function routingQualityReport(data: ArmData[], stats: ArmStats[], cq: CostQualityReport): RoutingQuality {
    const baselines = data.filter((d) => d.meta.kind === "fixed" && d.cellList.length > 0);
    const routers = data.filter((d) => d.meta.kind === "router" && d.cellList.length > 0);
    const unavailable = (reason: string): RoutingQuality => ({
      available: false,
      reason,
      baselineArmIds: baselines.map((b) => b.meta.id),
      nTasks: 0,
      oracle: null,
      bestFixed: null,
      cheapestFixed: null,
      routers: [],
    });
    if (baselines.length === 0) {
      return unavailable("No fixed-model baseline arms (arms with a pinned, non-auto model): oracle and regret analysis skipped.");
    }
    const T = baselines[0].cellList.map((c) => c.taskId).filter((t) => baselines.every((b) => b.cells.has(t)));
    if (T.length === 0) return unavailable("Fixed-model baselines share no tasks: oracle analysis skipped.");
    const armMeanCost = new Map(stats.map((s) => [s.armId, s.cost.meanUsd]));
    const costOf = (b: ArmData, t: string) => b.cells.get(t)!.meanCost ?? armMeanCost.get(b.meta.id) ?? null;
    // Oracle per task: highest score among baselines, cheapest among those achieving it.
    const oracleByTask = new Map<string, { score: number; cost: number | null; pick: string }>();
    for (const t of T) {
      const best = Math.max(...baselines.map((b) => b.cells.get(t)!.meanScore));
      const cands = baselines.filter((b) => b.cells.get(t)!.meanScore >= best - 1e-12);
      cands.sort((x, y) => (costOf(x, t) ?? Infinity) - (costOf(y, t) ?? Infinity));
      oracleByTask.set(t, { score: best, cost: costOf(cands[0], t), pick: cands[0].meta.id });
    }
    const accOn = (d: ArmData, ts: string[]) => avg(ts.map((t) => d.cells.get(t)!.meanScore));
    const costOn = (d: ArmData, ts: string[]) => avg(ts.map((t) => costOf(d, t)).filter((x): x is number => x != null));
    const oracleAcc = (ts: string[]) => avg(ts.map((t) => oracleByTask.get(t)!.score));
    const oracleCost = (ts: string[]) => avg(ts.map((t) => oracleByTask.get(t)!.cost).filter((x): x is number => x != null));
    const baseRows = baselines.map((b) => ({ d: b, acc: accOn(b, T) ?? 0, cost: costOn(b, T) }));
    const bestFixed = [...baseRows].sort((x, y) => y.acc - x.acc || (x.cost ?? Infinity) - (y.cost ?? Infinity))[0];
    const cheapestFixed = [...baseRows].sort((x, y) => (x.cost ?? Infinity) - (y.cost ?? Infinity) || y.acc - x.acc)[0];
    const picks = baselines.map((b) => ({ armId: b.meta.id, share: T.filter((t) => oracleByTask.get(t)!.pick === b.meta.id).length / T.length }));
    const gainMap = new Map(cq.gainOverBaselineHull.map((g) => [g.armId, g.gain]));

    const routerRows: RouterVsOracle[] = routers.map((r) => {
      const ts = T.filter((t) => r.cells.has(t));
      const rAcc = accOn(r, ts);
      const rCost = costOn(r, ts);
      const oAcc = oracleAcc(ts);
      const oCost = oracleCost(ts);
      const bCost = costOn(bestFixed.d, ts);
      const cAcc = accOn(cheapestFixed.d, ts);
      const regretDiffs = ts.map((t) => bestFixed.d.cells.get(t)!.meanScore - r.cells.get(t)!.meanScore);
      const rb = regretDiffs.length
        ? bootstrapMean(regretDiffs, { iterations: iters(regretDiffs.length), seed: sd0(`regret|${r.meta.id}`), alpha })
        : null;
      const headDen = oAcc != null && cAcc != null ? oAcc - cAcc : null;
      return {
        armId: r.meta.id,
        nTasks: ts.length,
        accuracy: num(rAcc),
        meanCostUsd: num(rCost),
        accuracyGapToOracle: oAcc != null && rAcc != null ? num(oAcc - rAcc) : null,
        costRatioToOracle: rCost != null && oCost != null && oCost > 0 ? num(rCost / oCost) : null,
        regretVsBestFixed: rb ? fromBoot(rb, "paired-cluster-bootstrap-percentile", 2, regretDiffs.length) : NULL_EST("paired-cluster-bootstrap-percentile"),
        costSavingsVsBestFixed: rCost != null && bCost != null && bCost > 0 ? num(1 - rCost / bCost) : null,
        headroomCaptured: headDen != null && headDen > 1e-9 && rAcc != null && cAcc != null ? num((rAcc - cAcc) / headDen) : null,
        gainOverBaselineHull: gainMap.get(r.meta.id) ?? null,
        dominatedBy:
          rAcc != null && rCost != null
            ? baselines
                .map((b) => ({ armId: b.meta.id, accuracy: accOn(b, ts), meanCostUsd: costOn(b, ts) }))
                .filter((b): b is { armId: string; accuracy: number; meanCostUsd: number } => b.accuracy != null && b.meanCostUsd != null)
                .filter((b) => dominates({ id: b.armId, cost: b.meanCostUsd, quality: b.accuracy }, { id: r.meta.id, cost: rCost, quality: rAcc }))
                .sort((x, y) => y.accuracy - x.accuracy || x.meanCostUsd - y.meanCostUsd)
                .map((b) => ({ armId: b.armId, accuracy: num(b.accuracy)!, meanCostUsd: num(b.meanCostUsd)! }))
            : [],
        ...hindsightAtBudget(r, ts, rAcc, rCost),
      };
    });

    // Hindsight baselines at the router's own spend (Vals AI Router Index, 2026): the best one could
    // do with the same money by fixing one model per category, or by picking a model per task.
    function hindsightAtBudget(r: ArmData, ts: string[], rAcc: number | null, rCost: number | null) {
      const none = { fixedPerCategoryAtBudget: null, perTaskAtBudget: null };
      if (rAcc == null || rCost == null || ts.length === 0) return none;
      const priced = baselines.filter((b) => ts.every((t) => costOf(b, t) != null));
      if (priced.length === 0) return none;
      const served = new Set(r.obs.map((o) => o.model).filter((m): m is string => m != null));
      const servedBy = (b: ArmData) => [b.meta.model, ...b.obs.map((o) => o.model)].some((m) => m != null && served.has(m));
      const own = priced.filter(servedBy);
      const pool: "router-models" | "all-baselines" = own.length > 0 ? "router-models" : "all-baselines";
      const cands = own.length > 0 ? own : priced;
      const budget = rCost * ts.length;
      const finish = (choice: BudgetChoice | null, picks: { category: string; armId: string }[]): HindsightAtBudget | null => {
        if (!choice) return null;
        const acc = choice.score / ts.length;
        return {
          pool,
          candidateArmIds: cands.map((b) => b.meta.id),
          accuracy: num(acc),
          meanCostUsd: num(choice.cost / ts.length),
          gainOverRouter: num(acc - rAcc),
          picks,
        };
      };
      const cats = [...new Set(ts.map((t) => r.cells.get(t)!.category))].sort();
      const catTasks = cats.map((c) => ts.filter((t) => r.cells.get(t)!.category === c));
      const perCat = bestUnderBudget(
        catTasks.map((group) =>
          cands.map((b) => ({
            id: b.meta.id,
            score: group.reduce((s, t) => s + b.cells.get(t)!.meanScore, 0),
            cost: group.reduce((s, t) => s + costOf(b, t)!, 0),
          })),
        ),
        budget,
      );
      const perTask = bestUnderBudget(
        ts.map((t) => cands.map((b) => ({ id: b.meta.id, score: b.cells.get(t)!.meanScore, cost: costOf(b, t)! }))),
        budget,
      );
      return {
        fixedPerCategoryAtBudget: finish(perCat, perCat ? cats.map((category, i) => ({ category, armId: perCat.picks[i] })) : []),
        perTaskAtBudget: finish(perTask, []),
      };
    }
    return {
      available: true,
      reason: routers.length ? null : "No router arms to compare against the oracle.",
      baselineArmIds: baselines.map((b) => b.meta.id),
      nTasks: T.length,
      oracle: { accuracy: num(oracleAcc(T)), meanCostUsd: num(oracleCost(T)), picks },
      bestFixed: { armId: bestFixed.d.meta.id, accuracy: num(bestFixed.acc), meanCostUsd: num(bestFixed.cost) },
      cheapestFixed: { armId: cheapestFixed.d.meta.id, accuracy: num(cheapestFixed.acc), meanCostUsd: num(cheapestFixed.cost) },
      routers: routerRows,
    };
  }

  function ratingsReport(data: ArmData[]): RatingsReport {
    const items = data.map((d) => d.meta.id);
    const matches: PairwiseMatch[] = [];
    const tasks = new Set<string>();
    for (let i = 0; i < data.length; i++) {
      for (let j = i + 1; j < data.length; j++) {
        for (const c of data[i].cellList) {
          const o = data[j].cells.get(c.taskId);
          if (!o) continue;
          const d = c.meanScore - o.meanScore;
          matches.push({ a: items[i], b: items[j], scoreA: d > 1e-12 ? 1 : d < -1e-12 ? 0 : 0.5, group: c.taskId });
          tasks.add(c.taskId);
        }
      }
    }
    const k = items.length;
    const G = Math.max(1, tasks.size);
    const bIters = Math.min(B, Math.max(100, Math.floor(20_000_000 / (G * (k + k * k)))));
    if (k < 2 || matches.length === 0) {
      return {
        method: "bradley-terry-mm (ties = ½ win), Elo scale",
        nMatches: 0,
        nTasks: 0,
        bootstrapIterations: 0,
        rows: items.map((armId, i) => ({ armId, rating: k === 1 ? 1000 : null, lo: null, hi: null, se: null, rank: i + 1, rankLo: null, rankHi: null, games: 0, score: 0 })),
        winProbability: { armIds: items, matrix: items.map(() => items.map(() => 0.5)) },
        onlineElo: items.map((armId) => ({ armId, rating: null })),
      };
    }
    // Arms without any head-to-head outcome are left unrated (null) rather than
    // being pulled to the prior mean.
    const rated = items.filter((id) => matches.some((m) => m.a === id || m.b === id));
    const unrated = items.filter((id) => !rated.includes(id));
    const bt = bradleyTerryBootstrap(rated, matches, { iterations: bIters, seed: sd0("bt"), alpha });
    const el = onlineElo(rated, matches, { shuffles: 20, seed: sd0("elo") });
    return {
      method: "bradley-terry-mm (ties = ½ win), Elo scale",
      nMatches: matches.length,
      nTasks: tasks.size,
      bootstrapIterations: bIters,
      rows: [
        ...bt.ratings
          .map((r) => ({ armId: r.id, rating: num(r.rating), lo: num(r.lo), hi: num(r.hi), se: num(r.se), rank: r.rank, rankLo: num(r.rankLo), rankHi: num(r.rankHi), games: r.games, score: r.score }))
          .sort((x, y) => x.rank - y.rank),
        ...unrated.map((armId, i) => ({ armId, rating: null, lo: null, hi: null, se: null, rank: rated.length + i + 1, rankLo: null, rankHi: null, games: 0, score: 0 })),
      ],
      winProbability: { armIds: rated, matrix: bt.winProbability },
      onlineElo: items.map((armId) => ({ armId, rating: rated.includes(armId) ? num(el[armId]) : null })),
    };
  }

  function powerReport(data: ArmData[], stats: ArmStats[], disc: number[], diffSds: number[]): PowerReport {
    const active = data.filter((d) => d.cellList.length > 0);
    const shared = active.length
      ? active[0].cellList.map((c) => c.taskId).filter((t) => active.every((d) => d.cells.has(t))).length
      : 0;
    const accs = stats.map((s) => s.accuracy.value).filter((x): x is number => x != null);
    const p0 = accs.length ? median(accs) : null;
    const discordance = disc.length ? median(disc) : null;
    const psi = discordance != null && discordance > 0 ? discordance : p0 != null ? 2 * p0 * (1 - p0) : null;
    const p0c = p0 != null ? Math.min(0.99, Math.max(0.01, p0)) : null;
    const target = p0c != null ? (p0c <= 0.5 ? Math.min(1, p0c + 0.05) : Math.max(0, p0c - 0.05)) : null;
    return {
      alpha,
      power: 0.8,
      nTasks: shared,
      baselineAccuracy: num(p0),
      discordance: num(discordance),
      mdeUnpaired: shared > 0 && p0c != null ? num(mdeTwoProportions(shared, p0c, alpha, 0.8)) : null,
      mdePaired: shared > 0 && psi != null ? num(mdePairedProportions(shared, psi, alpha, 0.8)) : null,
      mdeMeanScore: shared > 0 && diffSds.length ? num(mdePairedMeans(shared, median(diffSds), alpha, 0.8)) : null,
      tasksFor5pp: {
        unpaired: p0c != null && target != null ? num(requiredNTwoProportions(p0c, target, alpha, 0.8)) : null,
        paired: psi != null ? num(requiredNPairedProportions(0.05, Math.max(psi, 0.05), alpha, 0.8)) : null,
      },
      note:
        "Units are tasks (repetitions of a task are not independent). Paired figures use McNemar's test with the observed median discordance between arms; unpaired figures use the two-proportion z-test at the median arm accuracy. α two-sided, power 0.8.",
    };
  }
}

/** Collapse binary outcomes by x into (x, success fraction, weight) rows for a fast weighted logistic fit. */
function aggregateBinary(x: number[], y: number[]): { x: number[]; y: number[]; w: number[] } {
  const m = new Map<number, [number, number]>();
  for (let i = 0; i < x.length; i++) {
    const e = m.get(x[i]) ?? [0, 0];
    e[y[i] ? 0 : 1]++;
    m.set(x[i], e);
  }
  const ox: number[] = [];
  const oy: number[] = [];
  const ow: number[] = [];
  for (const [xv, [s, f]] of m) {
    if (s) {
      ox.push(xv);
      oy.push(1);
      ow.push(s);
    }
    if (f) {
      ox.push(xv);
      oy.push(0);
      ow.push(f);
    }
  }
  return { x: ox, y: oy, w: ow };
}
