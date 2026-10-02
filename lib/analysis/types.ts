/**
 * RunReport: the complete, JSON-serializable statistical analysis of one BenchRun.
 *
 * Conventions (all fields):
 * - Plain objects and arrays only; no Maps, Dates, class instances, NaN or Infinity.
 *   Any statistic that is undefined for the data (too few samples, no cost data, ...)
 *   is `null`.
 * - Proportions/accuracies are in [0, 1] (not percent). Costs are USD. Times are ms.
 * - Intervals are two-sided at `report.options.level` (default 0.95).
 * - Arrays keyed by arm follow the order of `meta.arms`.
 * See docs/METHODOLOGY.md for every definition.
 */

/** A point estimate with a two-sided interval. */
export interface Estimate {
  value: number | null;
  lo: number | null;
  hi: number | null;
  /** How the interval was computed, e.g. "wilson", "cluster-bootstrap-bca", "bootstrap-percentile". */
  method: string;
}

/** describe() output with nulls for undefined values. */
export interface Summary {
  n: number;
  mean: number | null;
  sd: number | null;
  min: number | null;
  max: number | null;
  p50: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
}

export interface XY {
  x: number;
  y: number;
}

/** A fitted probability curve point with a pointwise confidence band. */
export interface CurvePoint {
  x: number;
  p: number;
  lo: number;
  hi: number;
}

export type ArmKind = "router" | "fixed";

export interface AnalyzeOptions {
  /** Seed for every randomized procedure (default: run.config.seed ?? 1). */
  seed?: number;
  /** Bootstrap resamples (default 1000). Also used for permutation tests. */
  bootstrapIterations?: number;
  /** Confidence level for all intervals (default 0.95). */
  level?: number;
  /** Number of equal-width difficulty buckets over [0, 1] (default 4). */
  difficultyBuckets?: number;
  /** Force these arm ids to be treated as fixed-model baselines. */
  fixedArmIds?: string[];
  /** Force these arm ids to be treated as routers (wins over fixedArmIds). */
  routerArmIds?: string[];
  /**
   * Work cap per bootstrap: iterations are reduced so that iterations × units ≤ this
   * (never below 200). Default 2,000,000. Keeps 10k-sample runs fast in a browser.
   */
  maxBootstrapWork?: number;
  /** Max points in ECDF / KDE series (default 200 / 80). */
  ecdfPoints?: number;
  kdePoints?: number;
  /** Weights for the default TejScore. */
  tejWeights?: Partial<TejWeights>;
  /** Timestamp to stamp into the report (default Date.now()). */
  now?: number;
}

export interface ResolvedOptions {
  seed: number;
  bootstrapIterations: number;
  level: number;
  alpha: number;
  difficultyBuckets: number;
  maxBootstrapWork: number;
}

// ---------------------------------------------------------------- meta

export interface ArmMeta {
  id: string;
  label: string;
  color: string;
  providerId: string;
  model: string | null;
  kind: ArmKind;
  /** Why the arm was classified as router/fixed. */
  kindReason: string;
}

export interface DifficultyBucket {
  index: number;
  lo: number;
  hi: number;
  label: string;
  nTasks: number;
}

export interface RunMeta {
  runId: string;
  name: string;
  createdAt: number;
  finishedAt: number | null;
  durationMs: number | null;
  nSamples: number;
  nTasks: number;
  nArms: number;
  /** Configured repetitions, and the observed min/max reps per (arm, task). */
  repetitions: number;
  repsObserved: { min: number; max: number };
  arms: ArmMeta[];
  categories: { name: string; nTasks: number }[];
  suites: string[];
  difficultyBuckets: DifficultyBucket[];
  /** True when at least one sample has a cost. */
  hasCost: boolean;
  /** True when at least one fixed-model baseline arm is present. */
  hasBaselines: boolean;
}

// ---------------------------------------------------------------- per arm

export interface CostStats {
  totalUsd: number | null;
  /** Mean cost per request over samples with a known cost. */
  meanUsd: number | null;
  meanUsdCI: Estimate;
  nWithCost: number;
  nReported: number;
  nEstimated: number;
  nMissing: number;
  reportedUsd: number;
  estimatedUsd: number;
  /** nWithCost / n. */
  coverage: number;
  /** Σ cost / Σ correct over samples with known cost: expected spend per correct answer. */
  costPerCorrect: number | null;
  /** accuracy / meanUsd: accuracy points bought per dollar per request. */
  accuracyPerDollar: number | null;
  /** Σ correct / Σ cost: correct answers per dollar. */
  correctPerDollar: number | null;
}

export interface TokenStats {
  nWithUsage: number;
  promptTotal: number | null;
  completionTotal: number | null;
  totalTotal: number | null;
  reasoningTotal: number | null;
  promptMean: number | null;
  completionMean: number | null;
  totalMean: number | null;
}

export interface ArmStats {
  armId: string;
  label: string;
  color: string;
  kind: ArmKind;
  n: number;
  nTasks: number;
  nOk: number;
  nErrors: number;
  /** Error rate with Wilson interval. */
  errorRate: Estimate;
  /** Mean score (errors score 0), task-weighted, cluster-bootstrap BCa over tasks. */
  accuracy: Estimate;
  /** Mean score among successful (ok) samples only. */
  accuracyOk: number | null;
  /** Binary correct rate (sample level) with Wilson interval. */
  correctRate: Estimate;
  nCorrect: number;
  /** Beta-Binomial posterior on correctness with design-effect-adjusted counts. */
  accuracyPosterior: { alpha: number; beta: number; mean: number | null; lo: number | null; hi: number | null; effectiveN: number | null };
  latency: Summary;
  latencyMedianCI: Estimate;
  latencyEcdf: XY[];
  latencyKde: XY[];
  ttft: Summary;
  ttftMedianCI: Estimate;
  outputTps: Summary;
  outputTpsMedianCI: Estimate;
  cost: CostStats;
  tokens: TokenStats;
}

export interface CellStats {
  armId: string;
  nTasks: number;
  nSamples: number;
  accuracy: Estimate;
  correctRate: Estimate;
  meanCostUsd: number | null;
  medianLatencyMs: number | null;
}

export interface ArmCategoryStats extends CellStats {
  category: string;
}

export interface ArmBucketStats extends CellStats {
  bucket: number;
  label: string;
  lo: number;
  hi: number;
  meanDifficulty: number | null;
  /** Share of samples routed above the arm's escalation price threshold (null if not applicable). */
  escalationRate: number | null;
}

export interface DifficultyCurve {
  armId: string;
  n: number;
  /** Logistic fit (Firth) of P(correct) on difficulty. */
  intercept: number | null;
  slope: number | null;
  slopeLo: number | null;
  slopeHi: number | null;
  pSlope: number | null;
  oddsRatio: number | null;
  curve: CurvePoint[];
}

// ---------------------------------------------------------------- routing

export interface ModelShare {
  model: string;
  count: number;
  share: number;
  /** Blended list price (3:1 input:output) in USD per 1M tokens, null if unknown. */
  blendedPrice: number | null;
}

export interface MIStats {
  mi: number;
  /** I/√(H(X)H(Y)). */
  nmi: number;
  /** U(model | X) = I/H(model). */
  uncertainty: number;
  /** Miller-Madow bias-corrected MI. */
  miCorrected: number;
  g: number;
  df: number;
  pValue: number;
  n: number;
}

export interface EscalationStats {
  /** Price threshold (blended USD/1M): escalated = served price > threshold. */
  threshold: number;
  definition: string;
  n: number;
  nEscalated: number;
  rate: number;
  intercept: number | null;
  /** Adaptivity coefficient: logistic slope of P(escalate) per unit difficulty. */
  slope: number | null;
  slopeLo: number | null;
  slopeHi: number | null;
  pSlope: number | null;
  curve: CurvePoint[];
  /** OLS slope of ln(price) on difficulty. */
  logPriceSlope: number | null;
  /** Spearman correlation of difficulty and price. */
  spearman: number | null;
}

export interface RoutingStats {
  armId: string;
  kind: ArmKind;
  nWithModel: number;
  /** Successful samples whose response named no served model. */
  nUnknownModel: number;
  /** Failed calls (no routing decision observable). */
  nErrored: number;
  distinctModels: number;
  models: ModelShare[];
  byCategory: { category: string; n: number; models: ModelShare[] }[];
  byDifficulty: { bucket: number; label: string; n: number; models: ModelShare[] }[];
  entropyBits: number | null;
  normalizedEntropy: number | null;
  categoryMI: MIStats | null;
  difficultyMI: MIStats | null;
  /** JSD (bits, [0,1]) between model distributions of the easiest and hardest non-empty buckets. */
  easyHardJsd: { value: number; easyBucket: number; hardBucket: number } | null;
  escalation: EscalationStats | null;
  escalationReason: string | null;
  /** = escalation.slope (null when not estimable). */
  adaptivity: number | null;
}

export interface RouterVsOracle {
  armId: string;
  nTasks: number;
  accuracy: number | null;
  meanCostUsd: number | null;
  accuracyGapToOracle: number | null;
  costRatioToOracle: number | null;
  /** bestFixed.accuracy - router accuracy (positive = worse than best single model). */
  regretVsBestFixed: Estimate;
  costSavingsVsBestFixed: number | null;
  /** (router - cheapestFixed)/(oracle - cheapestFixed): share of oracle headroom captured. */
  headroomCaptured: number | null;
  /** Router quality minus baseline convex hull quality at the router's cost. */
  gainOverBaselineHull: number | null;
}

export interface RoutingQuality {
  available: boolean;
  reason: string | null;
  baselineArmIds: string[];
  nTasks: number;
  oracle: { accuracy: number | null; meanCostUsd: number | null; picks: { armId: string; share: number }[] } | null;
  bestFixed: { armId: string; accuracy: number | null; meanCostUsd: number | null } | null;
  cheapestFixed: { armId: string; accuracy: number | null; meanCostUsd: number | null } | null;
  routers: RouterVsOracle[];
}

// ---------------------------------------------------------------- pairwise

export interface PairwiseStats {
  a: string;
  b: string;
  nSharedTasks: number;
  /** Mean task-level score difference a - b, paired cluster bootstrap. */
  meanDiff: Estimate;
  permutationP: number | null;
  /** McNemar on per-task majority correctness. b = a right & b wrong; c = a wrong & b right. */
  mcnemar: { b: number; c: number; pExact: number | null; pMid: number | null; pChiSquare: number | null };
  wins: number;
  ties: number;
  losses: number;
  /** Bayesian P(acc_a > acc_b) (Beta posteriors, design-effect adjusted). */
  pAGreaterB: number | null;
  diffCredible: { mean: number | null; lo: number | null; hi: number | null };
  latency: {
    nPairs: number;
    medianDiffMs: number | null;
    wilcoxonP: number | null;
    /** Cliff's δ on all ok-sample latencies of a vs b (negative = a faster). */
    cliffsDelta: number | null;
    cliffsLo: number | null;
    cliffsHi: number | null;
    magnitude: string;
  };
  meanCostDiffUsd: number | null;
  pAdjusted: {
    mcnemarHolm: number | null;
    mcnemarBH: number | null;
    permutationHolm: number | null;
    latencyHolm: number | null;
  };
  /** Holm-adjusted McNemar p < alpha. */
  significant: boolean;
}

// ---------------------------------------------------------------- ratings, cost-quality

export interface RatingRow {
  armId: string;
  rating: number | null;
  lo: number | null;
  hi: number | null;
  se: number | null;
  rank: number;
  rankLo: number | null;
  rankHi: number | null;
  games: number;
  score: number;
}

export interface RatingsReport {
  method: string;
  nMatches: number;
  nTasks: number;
  bootstrapIterations: number;
  /** Sorted by rank; arms with no head-to-head outcomes come last with rating null. */
  rows: RatingRow[];
  /** BT-implied P(row arm beats column arm), over rated arms only. */
  winProbability: { armIds: string[]; matrix: number[][] };
  onlineElo: { armId: string; rating: number | null }[];
}

export interface CostQualityPoint {
  armId: string;
  kind: ArmKind;
  costUsd: number | null;
  costLo: number | null;
  costHi: number | null;
  quality: number | null;
  qualityLo: number | null;
  qualityHi: number | null;
  onFrontier: boolean;
  dominatedBy: string[];
}

export interface CostQualityReport {
  points: CostQualityPoint[];
  /** Pareto-optimal arm ids, ascending cost. */
  frontier: string[];
  /** Vertices of the non-decreasing convex hull, ascending cost. */
  hull: string[];
  aiq: number | null;
  aiqLogCost: number | null;
  costRange: { min: number | null; max: number | null };
  baselineHull: string[];
  baselineAiq: number | null;
  gainOverBaselineHull: { armId: string; gain: number | null }[];
}

// ---------------------------------------------------------------- TejScore

export interface TejWeights {
  accuracy: number;
  cost: number;
  latency: number;
  reliability: number;
}

export interface TejComponents {
  /** Raw accuracy (task-weighted mean score), for display; not used directly in the score. */
  accuracyRaw: number | null;
  /** Min-max normalized accuracy across arms: 1 = most accurate arm. */
  accuracy: number | null;
  /** Log-scale min-max of mean cost per request across arms: 1 = cheapest. */
  cost: number | null;
  /** Log-scale min-max of median latency across arms: 1 = fastest. */
  latency: number | null;
  /** 1 - error rate. */
  reliability: number | null;
}

export interface TejScoreRow {
  armId: string;
  score: number | null;
  rank: number | null;
  components: TejComponents;
}

export interface TejScoreReport {
  weights: TejWeights;
  formula: string;
  rows: TejScoreRow[];
}

// ---------------------------------------------------------------- power, consistency

export interface PowerReport {
  alpha: number;
  power: number;
  /** Tasks shared by all arms (the paired sample size). */
  nTasks: number;
  baselineAccuracy: number | null;
  /** Observed median discordance rate (share of tasks where two arms disagree on correctness). */
  discordance: number | null;
  /** Minimum detectable accuracy difference, independent-samples formula. */
  mdeUnpaired: number | null;
  /** Minimum detectable accuracy difference, McNemar (paired) formula. */
  mdePaired: number | null;
  /** MDE on mean score from the median sd of paired task-level differences. */
  mdeMeanScore: number | null;
  /** Tasks needed to detect a 5 percentage-point difference. */
  tasksFor5pp: { unpaired: number | null; paired: number | null };
  note: string;
}

export interface ConsistencyStats {
  armId: string;
  maxReps: number;
  tasksWithReps: number;
  correctAgreement: number | null;
  correctUnanimous: number | null;
  correctKappa: number | null;
  answerAgreement: number | null;
  routingAgreement: number | null;
  icc: number | null;
  iccMean: number | null;
  varBetween: number | null;
  varWithin: number | null;
  fractionWithin: number | null;
  designEffect: number | null;
}

// ---------------------------------------------------------------- report

export interface RunReport {
  version: 1;
  generatedAt: number;
  options: ResolvedOptions;
  meta: RunMeta;
  perArm: ArmStats[];
  perArmCategory: ArmCategoryStats[];
  perArmDifficultyBucket: ArmBucketStats[];
  difficultyCurves: DifficultyCurve[];
  routing: RoutingStats[];
  routingQuality: RoutingQuality;
  pairwise: PairwiseStats[];
  ratings: RatingsReport;
  costQuality: CostQualityReport;
  tejScore: TejScoreReport;
  power: PowerReport;
  consistency: ConsistencyStats[];
  warnings: string[];
}
