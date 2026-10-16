# TejRouter Methodology

TejRouter benchmarks LLM routers against each other: "the router that tests routers". This document defines every metric TejRouter reports, gives its formula, states the assumptions behind it, and explains how to read it. Each section names the `RunReport` field that holds the metric (see `lib/analysis/types.ts`). The implementations are in `lib/stats/*` (pure math) and `lib/analysis/*` (benchmark-specific analysis).

Notation: formulas are plain text with LaTeX-like symbols. `x̄` is a sample mean, `s` a sample standard deviation, `n` a sample size, `Φ` the standard normal CDF, `z_q = Φ⁻¹(q)`, `α = 1 − level` (default level 0.95, so α = 0.05), and `ln`/`log₂` are the natural and base-2 logarithms.

---

## Contents

1. [Principles](#1-principles)
2. [Data preparation](#2-data-preparation)
3. [Descriptive statistics](#3-descriptive-statistics)
4. [Accuracy](#4-accuracy)
5. [Binomial confidence intervals](#5-binomial-confidence-intervals)
6. [The bootstrap](#6-the-bootstrap)
7. [Error rate](#7-error-rate)
8. [Latency, time to first token, throughput](#8-latency-time-to-first-token-throughput)
9. [Cost](#9-cost)
10. [Tokens](#10-tokens)
11. [Bayesian accuracy](#11-bayesian-accuracy)
12. [Accuracy by category and by difficulty](#12-accuracy-by-category-and-by-difficulty)
13. [Difficulty curves (logistic regression)](#13-difficulty-curves-logistic-regression)
14. [Routing behaviour](#14-routing-behaviour)
15. [Routing quality: oracle and regret](#15-routing-quality-oracle-and-regret)
16. [Pairwise comparisons](#16-pairwise-comparisons)
17. [Hypothesis tests reference](#17-hypothesis-tests-reference)
18. [Effect sizes](#18-effect-sizes)
19. [Multiple comparisons](#19-multiple-comparisons)
20. [Ratings: Bradley-Terry and Elo](#20-ratings-bradley-terry-and-elo)
21. [Arena (human votes)](#21-arena-human-votes)
22. [Cost-quality frontier and AIQ](#22-cost-quality-frontier-and-aiq)
23. [TejScore](#23-tejscore)
24. [Power analysis](#24-power-analysis)
25. [Consistency and reliability](#25-consistency-and-reliability)
26. [Information theory](#26-information-theory)
27. [Advanced analysis](#27-advanced-analysis)
28. [Numerical methods and validation](#28-numerical-methods-and-validation)
29. [Assumptions and limitations](#29-assumptions-and-limitations)
30. [References](#30-references)

---

## 1. Principles

**The task is the unit of analysis.** A run sends every task to every arm `r` times (repetitions). Repetitions of one task are correlated: they share the task's difficulty, length and topic. Treating 100 tasks × 5 reps as 500 independent observations would overstate precision. TejRouter therefore:

- aggregates repetitions to a per-task, per-arm cell (mean score, majority correctness, mean cost, median latency);
- resamples tasks, not samples, in every bootstrap (the cluster bootstrap);
- pairs arms by task in every head-to-head comparison;
- shrinks sample-level counts by a design effect where a sample-level model is used (Section 11).

**Reproducibility.** Every randomized procedure (bootstrap, permutation test, Monte Carlo, online Elo shuffles) is seeded by a 32-bit mulberry32 generator. Each sub-computation derives its own seed from the run seed and a label (FNV-1a hash of `"seed|label"`), so results do not depend on evaluation order. The seed is `options.seed`, else `run.config.seed`, else 1. Analysing the same run twice gives identical numbers (except `generatedAt`).

**Undefined means null.** A statistic that does not exist for the data (the variance of one value, a cost mean with no cost data, a p-value with no discordant pairs) is reported as `null`, never as `NaN`, `Infinity` or a placeholder 0. The report is plain JSON.

**Intervals.** All intervals are two-sided at `options.level` (default 95%). The `method` field of each `Estimate` says how the interval was computed.

**Field reference:** `report.options` (seed, bootstrapIterations, level, alpha, difficultyBuckets, maxBootstrapWork), `report.warnings` (data-quality notes).

---

## 2. Data preparation

### 2.1 Score and correctness

Each sample has a grader score `g ∈ [0, 1]` and a boolean `correct`. TejRouter uses:

- `score = clamp(g, 0, 1)` if the request succeeded (`result.ok`), else `0`;
- `correct = ok ∧ grade.correct`.

So **errors count as wrong answers**: a router that times out has not answered. Accuracy among successful responses only is reported separately as `perArm[].accuracyOk`.

### 2.2 Task cells

For arm `a` and task `t` with repetitions `i = 1..m`:

- `meanScore(a,t) = (1/m) Σᵢ scoreᵢ`
- `correctFrac(a,t) = (1/m) Σᵢ correctᵢ`, and `majorityCorrect(a,t) = correctFrac > ½` (a strict majority; with one rep this is simply `correct`)
- `meanCost(a,t)` = mean of known costs (null if none)
- `medianLatency(a,t)` = median latency over successful reps

### 2.3 Difficulty buckets

Task difficulty `d ∈ [0, 1]` is a human estimate stored with the task. Buckets are `K` equal-width intervals (default `K = 4`): bucket `⌊d·K⌋`, with `d = 1` in the last bucket. **Field:** `meta.difficultyBuckets`.

### 2.4 Router arms and fixed baselines

An arm is a router plus an optional pinned model. TejRouter classifies each arm (`meta.arms[].kind`, with the reason in `kindReason`):

- **router**: no pinned model, or the pinned model is the provider's auto-routing id (for example `openrouter/auto`, `cyberouter/auto`, `sim/auto`, or any id ending in `auto`), or a pinned model that was nevertheless served as two or more different models with no single model above 95% of responses;
- **fixed** (a baseline): a pinned, non-auto model that the provider served consistently.

`options.fixedArmIds` and `options.routerArmIds` override the classification.

### 2.5 Price of a served model

To rank served models by price, TejRouter looks up the served model id in the list-price table (`lib/pricing.ts`, longest substring match) and uses a **blended price** in USD per million tokens:

```
blendedPrice = (3 · inputPrice + outputPrice) / 4
```

The 3:1 input:output blend is a common convention for chat workloads. It only orders models by price for the routing analysis. Cost metrics use each request's actual or estimated cost.

---

## 3. Descriptive statistics

Implemented in `lib/stats/descriptive.ts`.

| Statistic | Formula | Notes |
|---|---|---|
| Mean | `x̄ = (1/n) Σ xᵢ` | Neumaier-compensated summation |
| Sample variance | `s² = Σ(xᵢ − x̄)² / (n − 1)` | Two-pass algorithm with a correction term; undefined for n < 2 |
| Standard deviation | `s = √s²` | |
| Standard error | `s / √n` | |
| Geometric mean | `exp((1/n) Σ ln xᵢ)` | All `xᵢ > 0` required |
| Quantile | Hyndman-Fan type 7 (below) | Default in R and NumPy |
| `describe()` | `{n, mean, sd, min, max, p50, p90, p95, p99}` | Report type `Summary` |

**Type-7 quantile.** Sort `x₍₀₎ ≤ … ≤ x₍ₙ₋₁₎` (0-based). For probability `p`, let `h = (n − 1)p`, `j = ⌊h⌋`. Then

```
Q(p) = x₍ⱼ₎ + (h − j) · (x₍ⱼ₊₁₎ − x₍ⱼ₎)
```

This linearly interpolates between order statistics, gives `Q(0) = min` and `Q(1) = max`, and matches R's `quantile(x, type = 7)`. Example: for `{1, 2, 3, 4}`, `Q(0.25) = 1.75`.

**ECDF.** `F̂(x) = #{xᵢ ≤ x} / n`, reported as step points `(x, F̂(x))` at each distinct value, thinned to at most 200 evenly spaced points (`perArm[].latencyEcdf`). Read it as "the share of requests that finished within x ms".

**Histogram.** Equal-width bins. The default count follows the Freedman-Diaconis rule, `width = 2·IQR·n^(−1/3)`, falling back to Sturges (`⌈log₂ n⌉ + 1`) when IQR = 0, clamped to [1, 100]. `density = count / (n · width)` integrates to 1.

**Kernel density estimate.** Gaussian kernel:

```
f̂(x) = (1 / (n h)) Σᵢ φ((x − xᵢ) / h)
h = 0.9 · min(s, IQR / 1.34) · n^(−1/5)          (Silverman's rule of thumb)
```

Evaluated on 80 grid points over `[max(0, min − 3h), max + 3h]` for latency (`perArm[].latencyKde`). Silverman's rule is near-optimal for roughly normal data and oversmooths multimodal data; latency distributions with two modes (for example a router mixing a fast and a slow model) may appear as one broad hump.

---

## 4. Accuracy

**Field:** `perArm[].accuracy` (an `Estimate`).

```
accuracy(a) = (1/T) Σₜ meanScore(a, t)
```

over the `T` tasks the arm attempted. Each task has equal weight regardless of how many repetitions it has. With balanced repetitions this equals the plain sample mean.

**Interval:** cluster bootstrap over tasks with the BCa method (Section 6), `method = "cluster-bootstrap-bca"`. It is null with fewer than 2 tasks.

**Binary correct rate:** `perArm[].correctRate` is the sample-level share of correct answers with a Wilson interval (Section 5). When graders are binary it equals the accuracy estimate. Its interval treats samples as independent and is narrower than the cluster interval when repetitions agree with each other. Prefer `accuracy` for inference.

**Interpretation:** accuracy is the expected score on a task drawn uniformly from this suite. The interval covers sampling variability of tasks and of the router's randomness. It does not cover the choice of suite: a different task suite would give a different accuracy.

---

## 5. Binomial confidence intervals

Implemented in `lib/stats/intervals.ts`, for `x` successes in `n` trials and `p̂ = x/n`.

### 5.1 Wilson score interval (default)

```
center = (p̂ + z²/(2n)) / (1 + z²/n)
half   = z / (1 + z²/n) · √( p̂(1 − p̂)/n + z²/(4n²) )
CI     = [center − half, center + half],  z = z_{1−α/2}
```

Wilson inverts the score test. Its coverage is close to nominal even for small `n` and for `p̂` near 0 or 1, where the textbook Wald interval `p̂ ± z√(p̂(1−p̂)/n)` fails badly (Brown, Cai & DasGupta 2001). Used for error rates, correct rates and arena win rates.

### 5.2 Clopper-Pearson (exact)

```
lo = B⁻¹(α/2; x, n − x + 1)       (lo = 0 if x = 0)
hi = B⁻¹(1 − α/2; x + 1, n − x)   (hi = 1 if x = n)
```

where `B⁻¹(q; a, b)` is the Beta quantile. This inverts two one-sided exact binomial tests and guarantees coverage ≥ nominal, so it is conservative. For 7/10 it gives [0.3475, 0.9333], matching R's `binom.test(7, 10)`.

### 5.3 Others

- **Jeffreys:** equal-tailed interval of the `Beta(x + ½, n − x + ½)` posterior.
- **Agresti-Coull:** add `z²/2` successes and failures, then use a Wald interval.
- **Student t interval for a mean:** `x̄ ± t_{1−α/2, n−1} · s/√n`.

---

## 6. The bootstrap

Implemented in `lib/stats/bootstrap.ts`. The bootstrap (Efron 1979) approximates the sampling distribution of a statistic `θ̂` by recomputing it on `B` resamples drawn with replacement from the data. TejRouter uses `B = options.bootstrapIterations` (default 1000).

**Percentile interval:** `[Q*(α/2), Q*(1 − α/2)]`, the type-7 quantiles of the bootstrap replicates `θ*`.

**Basic interval:** `[2θ̂ − Q*(1 − α/2), 2θ̂ − Q*(α/2)]`.

**BCa interval** (bias-corrected and accelerated; Efron 1987). It corrects the percentile interval for median bias and for skewness or a variance that changes with the parameter:

```
z₀ = Φ⁻¹( (#{θ* < θ̂} + ½ #{θ* = θ̂}) / B )                         bias correction
a  = Σᵢ (θ̄₍.₎ − θ₍ᵢ₎)³ / ( 6 [ Σᵢ (θ̄₍.₎ − θ₍ᵢ₎)² ]^{3/2} )           acceleration (jackknife)
α₁ = Φ( z₀ + (z₀ + z_{α/2})   / (1 − a(z₀ + z_{α/2})) )
α₂ = Φ( z₀ + (z₀ + z_{1−α/2}) / (1 − a(z₀ + z_{1−α/2})) )
CI = [Q*(α₁), Q*(α₂)]
```

`θ₍ᵢ₎` is the statistic with unit `i` left out, and `θ̄₍.₎` their mean. With more than 1000 units a grouped jackknife (1000 contiguous blocks) is used. BCa is second-order accurate. TejRouter uses it for accuracy and for paired accuracy differences.

**Cluster bootstrap.** Resample whole clusters (tasks) with replacement, keeping all repetitions of a task together (Field & Welsh 2007). For the task-weighted accuracy, this is equivalent to bootstrapping the per-task means. `clusterBootstrap(clusters, stat)` is the general form, for example with the pooled mean `Σ all scores / Σ all counts`. When repetitions are correlated, the cluster interval is wider than a naive sample-level bootstrap and gives honest coverage.

**Paired bootstrap.** For two arms on shared tasks, resample tasks and recompute `mean(scoreA − scoreB)` on the same resampled tasks. This keeps the positive correlation between arms on the same task, so the interval is much tighter than the one for two independent means.

**Work cap.** To keep analysis fast in a browser, the iteration count for a bootstrap over `u` units is reduced to `max(200, ⌊maxBootstrapWork / u⌋)` (default cap 2,000,000) when that is smaller than `B`. Percentile intervals with a few hundred resamples have small Monte Carlo error at the 95% level. The method label is unchanged.

**Assumptions:** units (tasks) are exchangeable draws from a larger population of tasks. The bootstrap can undercover for very small numbers of tasks (fewer than about 10); in that case read the intervals as rough.

---

## 7. Error rate

**Field:** `perArm[].errorRate` (Wilson), `nErrors`, `nOk`.

```
errorRate = #{samples with result.ok = false} / n
```

Errors include HTTP failures, timeouts and malformed responses. They are scored 0 in accuracy (Section 2.1).

---

## 8. Latency, time to first token, throughput

**Fields:** `perArm[].latency`, `ttft`, `outputTps` (each a `Summary`), `latencyMedianCI`, `ttftMedianCI`, `outputTpsMedianCI`, `latencyEcdf`, `latencyKde`.

- **Latency:** wall-clock milliseconds from request start to the last byte, over successful samples only.
- **TTFT:** time to first content token (ms), when streamed.
- **Output TPS:** completion tokens per second measured after the first token.

Latency distributions are right-skewed and heavy-tailed, so TejRouter summarizes them with quantiles (p50, p90, p95, p99) rather than with mean ± sd. The **median CI** is a percentile bootstrap over successful samples (`method = "bootstrap-percentile"`). Latency varies from request to request even for the same task, so the sample-level bootstrap is appropriate here. Compare tail percentiles (p95, p99) for user-facing worst cases.

**Interpretation note:** latency depends on network location, time of day and provider load. Comparisons are fair only between arms run in the same session, as all arms of one run are.

---

## 9. Cost

**Field:** `perArm[].cost` (`CostStats`).

Each sample's `costUsd` is either **reported** by the router (for example OpenRouter's usage cost) or **estimated** from token usage and the list-price table: `cost = (promptTokens · inputPrice + completionTokens · outputPrice) / 10⁶`. Estimated costs ignore discounts, caching and routing fees, so treat them as approximate. `nReported`, `nEstimated`, `nMissing`, `reportedUsd` and `estimatedUsd` show how much of the cost is measured. `coverage = nWithCost / n`.

| Metric | Definition |
|---|---|
| `totalUsd` | `Σ cost` over samples with known cost |
| `meanUsd` | task-weighted mean cost per request, `(1/T) Σₜ meanCost(a, t)` |
| `meanUsdCI` | cluster bootstrap (percentile) over tasks |
| `costPerCorrect` | `Σ cost / #correct`, over samples with known cost: expected spend per correct answer |
| `correctPerDollar` | `#correct / Σ cost` = 1 / costPerCorrect |
| `accuracyPerDollar` | `accuracy / meanUsd` |

**Interpretation:** `costPerCorrect` is the most decision-relevant single number when every question must eventually be answered correctly. A cheap router that is often wrong can cost more per correct answer than an expensive one. Errors cost whatever the provider billed for them, which is usually 0.

---

## 10. Tokens

**Field:** `perArm[].tokens`. Totals and means of prompt, completion, total and reasoning tokens over samples that reported usage (`nWithUsage`). If total tokens are not reported, prompt + completion is used.

---

## 11. Bayesian accuracy

Implemented in `lib/stats/bayes.ts`.

### 11.1 Beta-Binomial posterior

With a uniform prior `p ~ Beta(1, 1)` and `x` correct answers out of `n`, the posterior is

```
p | data ~ Beta(1 + x, 1 + n − x)
mean = (1 + x) / (2 + n)
```

The **equal-tailed credible interval** is the Beta quantiles at α/2 and 1 − α/2. The **highest-density interval (HDI)** is the shortest interval with mass 1 − α, found by golden-section search over the lower tail mass.

### 11.2 Design-effect adjustment

Samples are clustered by task, so `n` samples carry less information than `n` independent trials. TejRouter deflates the counts by the Kish design effect (Section 25.4):

```
DEFF = 1 + (m̄ − 1) · ICC           (m̄ = mean reps per task, ICC from Section 25.3, floored at 0)
p | data ≈ Beta(1 + x/DEFF, 1 + (n − x)/DEFF)
n_eff = n / DEFF
```

**Fields:** `perArm[].accuracyPosterior = {alpha, beta, mean, lo, hi, effectiveN}`.

### 11.3 Probability that A beats B

For independent posteriors `X ~ Beta(a₁, b₁)` (arm A) and `Y ~ Beta(a₂, b₂)` (arm B):

- **Exact** (for integer `a₁`, Miller 2015):

  ```
  P(X > Y) = Σ_{i=0}^{a₁−1} B(a₂ + i, b₁ + b₂) / ( (b₁ + i) · B(1 + i, b₁) · B(a₂, b₂) )
  ```

- **Numeric** (any real parameters): `P(X > Y) = ∫₀¹ f_X(x) · F_Y(x) dx`, by composite Simpson's rule with 2000 panels over the central `1 − 10⁻¹²` mass of X.
- **Monte Carlo:** seeded draws from both posteriors (Marsaglia-Tsang gamma sampler).

The design-effect-adjusted parameters are not integers, so the analysis uses the numeric method. **Field:** `pairwise[].pAGreaterB`, computed on the tasks both arms share. `pairwise[].diffCredible` is the posterior mean and equal-tailed interval of `p_A − p_B` from 10,000 seeded Monte Carlo draws.

**Interpretation:** `pAGreaterB = 0.97` means that, given the data and a flat prior, there is a 97% posterior probability that A's true accuracy exceeds B's. This is not a p-value. The two posteriors are treated as independent even though the arms ran on the same tasks; the paired tests in Section 16 use the pairing and are the primary evidence.

---

## 12. Accuracy by category and by difficulty

**Fields:** `perArmCategory[]` and `perArmDifficultyBucket[]` (`CellStats`): `nTasks`, `nSamples`, `accuracy` (cluster bootstrap percentile over the tasks in the cell), `correctRate` (Wilson), `meanCostUsd`, `medianLatencyMs`. Bucket rows add `meanDifficulty` and `escalationRate`, the share of priced samples whose served model is above the arm's escalation threshold (Section 14.5).

Cells have fewer tasks, so their intervals are wider. Comparing many cells invites false discoveries; treat cell-level differences as exploratory unless confirmed by a dedicated run.

---

## 13. Difficulty curves (logistic regression)

**Field:** `difficultyCurves[]`.

For each arm, the probability of a correct answer as a function of task difficulty `d`:

```
P(correct | d) = σ(β₀ + β₁ d),     σ(t) = 1 / (1 + e^{−t})
```

fitted on sample-level outcomes with Firth's bias-reduced logistic regression (below). Reported: `intercept`, `slope` β₁ with a Wald interval `β₁ ± z·SE`, `pSlope`, `oddsRatio = e^{β₁}` (multiplicative change in the odds of being correct from the easiest (d = 0) to the hardest (d = 1) task), and `curve`, 21 points on d ∈ [0, 1] with a pointwise band from the delta method on the logit scale:

```
Var(η̂(d)) = Var(β̂₀) + 2d·Cov(β̂₀, β̂₁) + d²·Var(β̂₁),   band = σ(η̂ ± z·√Var)
```

**Fitting** (`lib/stats/regression.ts`): Newton-Raphson / IRLS with step halving on the penalized log-likelihood. Firth (1993) maximizes `l(β) + ½ ln|XᵀWX|` (Jeffreys-prior penalty) through the modified score

```
U*(β) = Xᵀ( y − p + h ⊙ (½ − p) ),    h = diag( W^{½} X (XᵀWX)⁻¹ Xᵀ W^{½} ),   W = diag(p(1 − p))
```

Firth estimates exist even under complete separation (for example a model that answers every easy task right and every hard task wrong). The plain MLE does not exist in that case, and small benchmark samples often have it. For large samples Firth and MLE agree. Standard errors come from the inverse Fisher information. Outcomes are aggregated by distinct difficulty value with frequency weights, which gives the same fit faster.

**Interpretation:** a strongly negative slope means the arm degrades sharply on hard tasks. A router that escalates well should have a flatter curve than its cheap model alone.

---

## 14. Routing behaviour

**Field:** `routing[]` (`RoutingStats`). Uses successful samples that report a served model (`nWithModel`; `nUnknownModel` counts the rest).

### 14.1 Served-model distribution

`models[]`: count, share and blended price per served model, overall, plus `byCategory[]` and `byDifficulty[]` breakdowns. This is the router's observed policy.

### 14.2 Entropy of the model choice

```
H = −Σ_m p_m log₂ p_m           (bits; entropyBits)
H_norm = H / log₂ K             (normalizedEntropy; K = number of models served)
```

`H = 0`: always the same model. `H_norm = 1`: uniform over the models it uses. High entropy alone does not mean good routing; random routing also has high entropy. Adaptivity needs the conditional measures below.

### 14.3 Mutual information between task and model

Measures how much the task's category (or difficulty bucket) tells you about which model the router picks:

```
I(X; M) = H(X) + H(M) − H(X, M)                    (bits)
NMI    = I / √(H(X) · H(M))                         (nmi, in [0, 1]; Strehl & Ghosh 2002)
U(M|X) = I / H(M)                                   (uncertainty: share of model-choice entropy explained by X; Theil's U)
```

- `categoryMI`: X = task category. `difficultyMI`: X = difficulty bucket.
- **Bias correction:** the plug-in MI is biased upward by about `(r − 1)(c − 1) / (2N ln 2)` bits (Miller-Madow). `miCorrected` subtracts it and floors at 0.
- **Significance:** `G = 2N · I · ln 2` is the likelihood-ratio (G) statistic of independence, asymptotically χ² with `(r − 1)(c − 1)` degrees of freedom (`pValue`).

**Interpretation:** NMI ≈ 0 means the routing decision ignores the category (a fixed or random router). Larger NMI means the router routes differently by task type. A router that sends everything to one model has `H(M) = 0`, and NMI is defined as 0.

### 14.4 Easy-vs-hard divergence

```
JSD(P, Q) = ½ D(P ‖ M) + ½ D(Q ‖ M),   M = ½(P + Q),   D(P ‖ Q) = Σ p log₂(p/q)
```

between the served-model distributions of the easiest and hardest non-empty difficulty buckets (`easyHardJsd`). JSD is symmetric, bounded in [0, 1] bits, and √JSD is a metric. 0 means the router behaves identically on easy and hard tasks; 1 means disjoint model sets.

### 14.5 Escalation curve and adaptivity coefficient

**Field:** `routing[].escalation`, `routing[].adaptivity`.

For each arm, let the **threshold** be the median of the distinct blended prices of the models it served. A sample is **escalated** when its served model's price exceeds the threshold. With two price tiers this means "used the expensive model"; with more tiers, "used one of the more expensive half of the models it uses". Using distinct prices rather than per-sample prices keeps the definition meaningful when the expensive model is used more than half the time. Then

```
P(escalated | d) = σ(γ₀ + γ₁ d)       (Firth logistic regression)
adaptivity = γ₁
```

- `slope` (= `adaptivity`) is the log-odds increase in escalation from the easiest to the hardest task. Positive and large: the router spends more on harder tasks, which is the intended behaviour of a cost-aware router. Near 0: escalation is unrelated to difficulty. Reported with a Wald interval and p-value.
- `logPriceSlope`: OLS slope of ln(price) on difficulty (continuous version).
- `spearman`: rank correlation of difficulty and price.
- `curve`: fitted P(escalate | d) with a 95% band, for plotting.

Escalation is null (with `escalationReason`) when only one price tier was served (for example a fixed baseline), served models have no known price, or all tasks have the same difficulty.

**Assumption:** task difficulty labels are meaningful. They are human estimates; a router may legitimately disagree with them.

---

## 15. Routing quality: oracle and regret

**Field:** `routingQuality`. Available only when the run contains at least one **fixed** baseline arm (Section 2.4); otherwise `available = false` with a `reason`.

Let `𝓑` be the fixed baselines and `T` the tasks attempted by all of them.

**Oracle router.** For each task, the oracle picks the cheapest baseline that achieved the best score on that task:

```
best(t)   = max_{b ∈ 𝓑} meanScore(b, t)
pick(t)   = argmin_{b : meanScore(b,t) = best(t)} meanCost(b, t)
oracleAcc = (1/|T|) Σₜ best(t)
oracleCost = (1/|T|) Σₜ meanCost(pick(t), t)
```

If no baseline solves a task, the oracle pays for the cheapest baseline and scores 0. A missing task cost falls back to the baseline's mean cost. `oracle.picks` gives how often each baseline is the oracle's choice. The oracle is an upper bound on what any router could achieve with these models, using perfect hindsight.

**Best single fixed model** (`bestFixed`): the baseline with the highest accuracy on `T` (ties go to the cheaper one). **Cheapest fixed** (`cheapestFixed`): the lowest mean cost.

For each router arm, on the tasks it shares with `T` (`routers[]`):

| Field | Definition | Read as |
|---|---|---|
| `accuracyGapToOracle` | `oracleAcc − routerAcc` | Accuracy left on the table vs perfect routing |
| `costRatioToOracle` | `routerCost / oracleCost` | > 1: spends more than the oracle |
| `regretVsBestFixed` | `bestFixedAcc − routerAcc`, paired bootstrap CI over tasks | > 0: worse than always using the best model |
| `costSavingsVsBestFixed` | `1 − routerCost / bestFixedCost` | Share of spend saved vs always using the best model |
| `headroomCaptured` | `(routerAcc − cheapAcc) / (oracleAcc − cheapAcc)` | Share of the cheapest→oracle accuracy gap the router recovers |
| `gainOverBaselineHull` | `routerAcc − q̂_baselines(routerCost)` (Section 22) | > 0: beats every random mix of the baselines at the same cost |

**Caveats.** The oracle uses observed scores, which include sampling noise, so a router can occasionally exceed it (negative gap, or `headroomCaptured > 1`), especially with few repetitions or if the router uses models that are not among the baselines. Routers often serve models that are not in the baseline set at all; the oracle is then a reference point rather than a strict bound.

---

## 16. Pairwise comparisons

**Field:** `pairwise[]`, one entry for every unordered pair of arms (a, b), on their shared tasks (`nSharedTasks`).

| Field | Method | Null hypothesis |
|---|---|---|
| `meanDiff` | Mean of task-level score differences a − b, paired cluster bootstrap, BCa | |
| `permutationP` | Paired sign-flip permutation test on task-level differences (Section 17.6) | The difference distribution is symmetric about 0 |
| `mcnemar` | McNemar on per-task majority correctness (Section 17.5): `b` = a right & b wrong, `c` = a wrong & b right; exact, mid-p and χ² p-values | Both arms are equally likely to win a discordant task |
| `wins/ties/losses` | Per task, comparing mean scores (difference within 10⁻¹² counts as a tie) | |
| `pAGreaterB`, `diffCredible` | Bayesian, Section 11.3 | |
| `latency.wilcoxonP` | Wilcoxon signed-rank on paired per-task median latencies | Median of paired differences is 0 |
| `latency.medianDiffMs` | Median of paired per-task latency differences (a − b) | |
| `latency.cliffsDelta` | Cliff's δ on all successful latencies of a vs b, with interval and magnitude label; negative = a is faster | |
| `meanCostDiffUsd` | Mean per-task cost difference a − b | |
| `pAdjusted` | Holm (and BH) adjusted p-values across all pairs (Section 19) | |
| `significant` | `pAdjusted.mcnemarHolm < α` | |

**Which to read first:** `meanDiff` with its interval gives the size of the accuracy difference. `pAdjusted.mcnemarHolm` (or `permutationHolm` for graded scores) says whether it is distinguishable from noise after accounting for comparing many pairs. Pairing by task removes between-task variance, so paired comparisons are far more sensitive than comparing two separate accuracy intervals. Overlapping per-arm intervals do not imply a non-significant paired difference.

---

## 17. Hypothesis tests reference

Implemented in `lib/stats/tests.ts`. All are two-sided.

### 17.1 Welch's t-test (unequal variances)

```
t = (x̄₁ − x̄₂) / √(s₁²/n₁ + s₂²/n₂)
ν = (s₁²/n₁ + s₂²/n₂)² / [ (s₁²/n₁)²/(n₁−1) + (s₂²/n₂)²/(n₂−1) ]
p = P(|T_ν| ≥ |t|) = I_{ν/(ν+t²)}(ν/2, ½)
```

### 17.2 Paired t-test

`t = d̄ / (s_d / √n)`, `ν = n − 1`, on differences `dᵢ = aᵢ − bᵢ`. It assumes the differences are roughly normal, which is reasonable for means of many tasks by the central limit theorem.

### 17.3 Mann-Whitney U (Wilcoxon rank-sum)

Rank the pooled sample (average ranks for ties). `U = R₁ − n₁(n₁ + 1)/2`, where `R₁` is the rank sum of sample 1; `U` counts pairs with `aᵢ > bⱼ`, ties counting ½.

- **Exact** null distribution (no ties and `n₁n₂ ≤ 2500`), computed by dynamic programming over rank subsets.
- Otherwise a **normal approximation with tie correction** and continuity correction:

  ```
  μ = n₁n₂/2,   σ² = (n₁n₂/12) · [ (N + 1) − Σ(t³ − t) / (N(N − 1)) ]
  z = (U − μ − ½·sign(U − μ)) / σ
  ```

  where `t` runs over the sizes of tie groups.
- **Rank-biserial correlation** `r = 2U/(n₁n₂) − 1 = P(A > B) − P(A < B)` (identical to Cliff's δ), and the common-language effect size `U/(n₁n₂)`.

### 17.4 Wilcoxon signed-rank

Drop zero differences (Wilcoxon's convention), rank `|dᵢ|` with average ranks, and let `W⁺` be the sum of ranks of positive differences.

- **Exact** for n ≤ 50: the permutation distribution of `W⁺` given the observed ranks, by dynamic programming on doubled ranks (exact even with tied ranks).
- Otherwise normal with `μ = n(n + 1)/4`, `σ² = n(n + 1)(2n + 1)/24 − Σ(t³ − t)/48`, and a continuity correction.
- Matched-pairs rank-biserial `(W⁺ − W⁻)/(W⁺ + W⁻)`.

### 17.5 Sign test, binomial test, McNemar

- **Exact binomial test** of `H₀: p = p₀`. For p₀ = ½, `p = min(1, 2·min(P(X ≤ k), P(X ≥ k)))`. In general it sums the probabilities of all outcomes no more likely than the observed one (R's `binom.test` method, relative tolerance 10⁻⁷).
- **Sign test:** binomial test of the number of positive differences among non-zero ones, with p₀ = ½.
- **McNemar** for paired binary outcomes with discordant counts `b`, `c`:
  - exact (conditional) p: binomial test of `b ~ Bin(b + c, ½)`;
  - **mid-p**: `2·[P(X ≤ min(b,c)) − ½ P(X = min(b,c))]`, less conservative with good type-I error control (Fagerland, Lydersen & Laake 2013);
  - χ² with Edwards' continuity correction: `(|b − c| − 1)² / (b + c)`, 1 df.

  Only discordant tasks carry information about which arm is better. If `b + c = 0`, p = 1.

### 17.6 Permutation tests

- **Paired (sign-flip):** under H₀ each difference `dᵢ` is equally likely to have either sign. Statistic `T = |mean(d)|`. Exact enumeration of all `2ⁿ` sign patterns for n ≤ 16; otherwise `B` seeded random sign patterns with

  ```
  p = (1 + #{T* ≥ T}) / (1 + B)
  ```

  which is a valid p-value that is never 0 (Phipson & Smyth 2010). The test makes no normality assumption and works for graded (non-binary) scores.
- **Two-sample:** random relabelling of the pooled sample, same correction.

### 17.7 χ² and G tests of independence

On an r × c table, with `Eᵢⱼ = (row total × column total)/N`: Pearson `χ² = Σ(O − E)²/E`, likelihood-ratio `G = 2 Σ O ln(O/E)`, both with `(r − 1)(c − 1)` df, plus Cramér's `V = √(χ² / (N(min(r, c) − 1)))`. These are asymptotic tests and are rough when expected counts are below 5.

---

## 18. Effect sizes

Implemented in `lib/stats/effect.ts`. P-values say whether a difference is detectable; effect sizes say how large it is.

| Effect size | Formula | Conventional magnitudes |
|---|---|---|
| Cohen's d | `(x̄₁ − x̄₂) / s_pooled`, `s_pooled = √(((n₁−1)s₁² + (n₂−1)s₂²)/(n₁+n₂−2))` | 0.2 small, 0.5 medium, 0.8 large (Cohen 1988) |
| Hedges' g | `J(ν)·d`, `J(ν) = Γ(ν/2) / (√(ν/2) Γ((ν−1)/2))`, ν = n₁+n₂−2 | as d; removes d's small-sample upward bias |
| d_z (paired) | `mean(d)/sd(d)` | as d |
| Cliff's δ | `P(A > B) − P(A < B)` over all n₁n₂ pairs | \|δ\| < 0.147 negligible, < 0.33 small, < 0.474 medium, else large (Romano et al. 2006) |

Cohen's d interval: `d ± z·√((n₁+n₂)/(n₁n₂) + d²/(2(n₁+n₂)))`. Cliff's δ is computed in O(n log n) by sorting and binary search. Its approximate interval is `tanh(atanh(δ) ± z·√((n₁+n₂+1)/(3n₁n₂)))`, which uses the exact null variance of δ (no ties) and stays inside (−1, 1). Cliff's δ is ordinal and robust to outliers, which suits latency.

---

## 19. Multiple comparisons

With k arms there are k(k−1)/2 pairs. At α = 0.05, testing 28 pairs (8 arms) yields about 1.4 false positives on average if no arm differs. TejRouter adjusts p-values across all pairs:

**Holm-Bonferroni** (Holm 1979), which controls the family-wise error rate (the probability of any false positive) under any dependence. With p-values sorted ascending `p₍₁₎ ≤ … ≤ p₍ₘ₎`:

```
p̃₍ᵢ₎ = max_{j ≤ i} min(1, (m − j + 1) · p₍ⱼ₎)
```

It is uniformly more powerful than plain Bonferroni (`min(1, m·p)`).

**Benjamini-Hochberg** (1995), which controls the false discovery rate (the expected share of false positives among discoveries):

```
p̃₍ᵢ₎ = min_{j ≥ i} min(1, m · p₍ⱼ₎ / j)
```

This is valid under independence or positive dependence. It is less strict than Holm and suited to exploratory screening.

**Fields:** `pairwise[].pAdjusted.{mcnemarHolm, mcnemarBH, permutationHolm, latencyHolm}`. Null p-values are excluded from `m`.

---

## 20. Ratings: Bradley-Terry and Elo

Implemented in `lib/stats/ranking.ts`. **Field:** `ratings`.

### 20.1 Matches from a benchmark run

For every pair of arms and every shared task, the arm with the higher mean score wins. Equal mean scores are a tie. All matches from one task form a bootstrap group.

### 20.2 Bradley-Terry model

```
P(i beats j) = pᵢ / (pᵢ + pⱼ),   pᵢ > 0
```

**Ties** count as half a win for each side. This gives the same sufficient statistics as one win plus one loss at half weight, the convention used by the LMSYS Chatbot Arena fit. Davidson's (1970) explicit tie model is not used: with symmetric half-win scoring the strengths remain ordinary BT odds and the update keeps its closed form.

**Fitting: the MM algorithm** (Hunter 2004). With `Wᵢ` the (half-win-weighted) wins of i and `nᵢⱼ` the games between i and j:

```
pᵢ ← (Wᵢ + κ/2) / ( Σ_{j≠i} nᵢⱼ / (pᵢ + pⱼ) + κ / (pᵢ + 1) )
```

Each sweep increases the (penalized) likelihood. **Regularization:** every item also plays `κ` virtual games (half won, half lost) against a fixed reference item of strength 1 (default κ = 1). This is a MAP estimate under a weak symmetric prior. It keeps strengths finite for undefeated or winless arms, where the MLE does not exist, and fixes the scale. Because the data likelihood is invariant to rescaling all `p`, each sweep also takes an exact coordinate-ascent step in the common scale (solving `Σᵢ σ(s + ln pᵢ) = k/2` by Newton's method), which otherwise converges very slowly. With κ = 0 the plain MLE is fitted with geometric-mean normalization.

### 20.3 Elo scale

```
Rᵢ = 1000 + (400 / ln 10) · (ln pᵢ − mean_k ln p_k)
P(i beats j) = 1 / (1 + 10^{(Rⱼ − Rᵢ)/400})
```

The mean rating is 1000. A 400-point gap means 10:1 odds and a 100-point gap means about 64%. **Field:** `ratings.winProbability` is the model-implied matrix.

### 20.4 Uncertainty

A percentile bootstrap that resamples **tasks** (all matches of a task together) and refits gives `lo`, `hi` and `se` for each rating. It also gives a 95% **rank interval** (`rankLo`, `rankHi`), the 2.5% and 97.5% quantiles of each arm's bootstrap rank. Two arms whose rank intervals overlap are not reliably ordered. Arms with no matches are unrated (`rating = null`).

### 20.5 Online Elo (comparison)

`ratings.onlineElo` uses sequential updates `Rₐ ← Rₐ + K(Sₐ − Eₐ)` with K = 16, averaged over 20 seeded random match orders. Online Elo depends on match order and is shown only for comparison; Bradley-Terry is the principled estimate.

---

## 21. Arena (human votes)

Implemented in `lib/analysis/arena.ts` (`arenaLeaderboard(votes)`).

A vote `{ id, at, prompt, armIds, winner }`:

- `winner` = an arm id: that arm beats every other arm in `armIds` (k − 1 matches).
- `"tie"`: every pair in the vote ties. With k arms there are k(k−1)/2 pairs, so each is weighted 2/k: a tie then carries the same k−1 games of evidence as a decisive vote over the same arms.
- `"all-bad"`: also a tie for every pair (no preference revealed), counted separately as `allBad`.

Votes with fewer than two distinct arms, or whose winner is not one of the arms, are invalid and skipped (`invalidVotes`). Ratings use the Bradley-Terry fit of Section 20 with the bootstrap resampling **votes** (a multi-arm vote is one unit). Each arm also gets `wins`, `losses`, `ties`, `allBad`, a `winRate = wins / votes` with a Wilson interval, a `decisiveWinRate = wins / (wins + losses)`, the observed head-to-head score matrix (`headToHead`) and the model win-probability matrix.

Human votes are subjective and prompt-dependent. Many votes on varied prompts are needed before rating gaps under about 50 points become reliable; check the bootstrap intervals.

---

## 22. Cost-quality frontier and AIQ

Implemented in `lib/stats/costquality.ts`. **Field:** `costQuality`.

Each arm is a point `(cost = mean USD per request, quality = accuracy)`, with intervals from the respective bootstraps (`points[]`). Arms without cost data are excluded from the geometry.

**Dominance.** A dominates B if `cost_A ≤ cost_B` and `quality_A ≥ quality_B` with at least one strict. `points[].dominatedBy` lists the arms dominating each arm.

**Pareto frontier** (`frontier`): the non-dominated arms in ascending cost. A rational buyer only picks frontier arms.

**Non-decreasing convex hull** (`hull`). Two configurations can be mixed at random: send a fraction t of queries to A and 1 − t to B. In expectation, every point on the segment between A and B is achievable. The best quality achievable at budget c is therefore the upper convex hull of the points, made non-decreasing in cost (spending more never forces lower quality). TejRouter builds it as the upper hull (Andrew's monotone chain) of the Pareto frontier.

**AIQ, Average Improvement in Quality** (Hu et al. 2024, RouterBench):

```
AIQ = 1/(c_max − c_min) · ∫_{c_min}^{c_max} q̂(c) dc
```

where `q̂` is the non-decreasing hull, linearly interpolated between vertices and flat after the last one, and `[c_min, c_max]` is the cost range of the arms. The integral is exact (trapezoids between vertices). AIQ summarizes the whole cost-quality trade-off in one number in [0, 1]: the average best quality available per budget level.

- `aiqLogCost`: the same on a log-cost axis, often more readable when costs span orders of magnitude. It is descriptive only: mixing interpolates linearly in cost, not in log cost.
- `baselineHull` / `baselineAiq`: the hull and AIQ of the fixed-model baselines only.
- `gainOverBaselineHull[]`: for router arms, `quality − q̂_baselines(cost)`, how much better the router is than the best random mix of baseline models at the same expected cost. It is null when the router is cheaper than the cheapest baseline (the hull is undefined there). A positive gain is evidence that the router's per-query decisions add value beyond picking a price point.

---

## 23. TejScore

Implemented in `lib/analysis/tejscore.ts`. **Fields:** `tejScore.rows[] = {armId, score, rank, components}`, `tejScore.weights`, `tejScore.formula`. `computeTejScore(report, weights)` recomputes it for any weights, so the UI can expose sliders.

```
TejScore = 100 · Σ_k w_k · s_k / Σ_k w_k        (over components k that are defined for the arm)
```

| Component | `s_k` ∈ [0, 1] | Default weight |
|---|---|---|
| Accuracy | `(a − a_min) / (a_max − a_min)` across arms, a = task-weighted accuracy (`accuracyRaw` keeps the raw value) | 0.50 |
| Cost | `(ln c_max − ln c) / (ln c_max − ln c_min)`, c = mean USD per request; 1 = cheapest; free arms get 1 | 0.20 |
| Latency | `(ln L_max − ln L) / (ln L_max − ln L_min)`, L = median latency; 1 = fastest | 0.15 |
| Reliability | `1 − error rate` (absolute) | 0.15 |

If every arm ties on a component, `s = 1` for all. Undefined components (for example no cost data) are dropped and the remaining weights renormalized. Arms with no samples get `score = null`.

**Design choices.**

- Cost and latency use log scales because they vary multiplicatively: halving cost is equally valuable at any price level.
- Accuracy, cost and latency are min-max normalized across the arms in the run, so TejScore ranks arms within a run. It is not comparable across runs, and adding an arm can change every score.
- Reliability is absolute so that one random failure does not swing an arm from 1 to 0.
- Min-max normalization amplifies small differences when arms are close. Read TejScore together with the confidence intervals of its inputs.

TejScore is a convenience summary, not a statistical estimate. The weights encode preferences, and the defaults favour quality.

---

## 24. Power analysis

Implemented in `lib/stats/power.ts`. **Field:** `power`.

All figures use tasks as the unit, two-sided `α = 0.05` and power 0.8.

**Independent proportions** (Fleiss, Levin & Paik 2003, no continuity correction), n per group:

```
n = [ z_{1−α/2} √(2 p̄ q̄) + z_{1−β} √(p₁q₁ + p₂q₂) ]² / (p₁ − p₂)²,   p̄ = (p₁ + p₂)/2
```

For example, 0.5 vs 0.6 needs 388 tasks per arm. `mdeUnpaired` inverts this at the run's task count and the median arm accuracy, moving toward 0.5.

**Paired proportions (McNemar)** (Connor 1987), with discordance probability `ψ = p₁₀ + p₀₁` and difference `δ = p₁₀ − p₀₁`:

```
n = [ z_{1−α/2} √ψ + z_{1−β} √(ψ − δ²) ]² / δ²
```

`discordance` is the observed median share of tasks on which two arms disagree on correctness. When it is unavailable, `2p(1 − p)` (independence) is used. `mdePaired` inverts this formula. Because the arms of a run see the same tasks, the paired figures are the relevant ones, and they are usually much smaller than the unpaired ones.

**Mean scores:** `mdeMeanScore = (z_{1−α/2} + z_{1−β}) · σ_d / √n`, with `σ_d` the median standard deviation of paired task-level score differences.

**`tasksFor5pp`:** tasks needed to detect a 5 percentage-point accuracy difference, paired and unpaired.

**Interpretation:** if two arms differ by less than the MDE, a non-significant result is expected even if the difference is real. Absence of evidence is not evidence of absence. To shrink the MDE, add tasks. More repetitions mostly reduce within-task noise and help less once the design effect is near 1.

---

## 25. Consistency and reliability

Implemented in `lib/stats/reliability.ts`. **Field:** `consistency[]` (null fields when an arm has one repetition per task).

### 25.1 Agreement across repetitions

For each task with m ≥ 2 repetitions, count agreeing pairs among the C(m, 2) pairs:

```
pairwise agreement = Σ_tasks #agreeing pairs / Σ_tasks C(m, 2)
unanimous          = share of tasks where all repetitions agree
```

These are computed for correctness (`correctAgreement`, `correctUnanimous`), for the extracted answer (`answerAgreement`, a self-consistency measure in the spirit of Wang et al. 2023), and for the served model (`routingAgreement`, routing determinism: 1 means the router always picks the same model for the same prompt).

### 25.2 Chance-corrected agreement

Fleiss' κ, generalized to unequal group sizes: `κ = (P̄ − P̄ₑ)/(1 − P̄ₑ)`, where `P̄` is the pairwise agreement and `P̄ₑ = Σⱼ pⱼ²` is the chance agreement from the pooled label frequencies (`correctKappa`). κ ≈ 0: repetitions agree no more than chance given the overall accuracy, so outcomes are coin flips per task. κ ≈ 1: outcomes are fully determined by the task.

### 25.3 Variance decomposition and ICC

A one-way random-effects ANOVA with tasks as groups:

```
MSB = Σ_t m_t (ȳ_t − ȳ)² / (k − 1)          between tasks
MSW = Σ_t Σ_i (y_ti − ȳ_t)² / (N − k)       within tasks (repetition noise)
n₀  = (N − Σ m_t² / N) / (k − 1)            adjusted group size (= m when balanced)
ICC(1)   = (MSB − MSW) / (MSB + (n₀ − 1) MSW)       (Shrout & Fleiss 1979)
ICC(1,k) = (MSB − MSW) / MSB                         reliability of a task mean (iccMean)
σ²_between = max(0, (MSB − MSW)/n₀),   σ²_within = MSW
fractionWithin = σ²_within / (σ²_between + σ²_within)
```

ICC(1) is the share of score variance explained by which task it is. High ICC: the arm is deterministic per task, and more tasks (not more reps) are needed for precision. Low ICC: repetition noise dominates, and more repetitions help. ICC can be slightly negative by chance when the true value is near 0.

### 25.4 Design effect

```
DEFF = 1 + (m̄ − 1) · max(0, ICC),   n_eff = n / DEFF
```

(Kish 1965). This is the factor by which clustering inflates the variance of a sample-level mean. It is used for the Bayesian posteriors (Section 11.2) and reported as `designEffect`.

---

## 26. Information theory

Implemented in `lib/stats/info.ts`. All in bits.

| Quantity | Formula |
|---|---|
| Entropy | `H(p) = −Σ pᵢ log₂ pᵢ` |
| Normalized entropy | `H / log₂ K`, K = number of non-zero categories (0 if K ≤ 1) |
| Miller-Madow entropy | `Ĥ + (K − 1)/(2N ln 2)` |
| KL divergence | `D(p ‖ q) = Σ pᵢ log₂(pᵢ/qᵢ)` (∞ if q = 0 where p > 0) |
| Jensen-Shannon divergence | `½D(p ‖ m) + ½D(q ‖ m)`, m = ½(p + q), bounded in [0, 1] |
| Mutual information | `I(X;Y) = H(X) + H(Y) − H(X,Y)` |
| NMI | `I / √(H(X)H(Y))`; also `I / min(H(X), H(Y))` |
| Uncertainty coefficient | `U(Y\|X) = I / H(Y)` |
| Bias-corrected MI | `I − (r − 1)(c − 1)/(2N ln 2)`, floored at 0 |
| G-test | `G = 2N·I·ln 2 ~ χ²_{(r−1)(c−1)}` |

---

## 27. Advanced analysis

The report's **Advanced** tab is off until switched on (a toggle beside the report tabs, remembered per browser). It answers questions the main report leaves out: how slow the slow calls are, what fails and how, whether answers have the right shape, how predictable cost is, how routers do on particular slices of input, and whether a router's behaviour is stable. It is computed in the browser by `analyzeAdvanced(run, report)` in `lib/analysis/advanced.ts` from the saved run plus the built-in task definitions (graders, tags, prompt text), so it works on runs saved before it existed. Sections that need data a run lacks say what to add instead of showing zeros.

Three opt-in task sets feed it. They are off unless picked under **Customize**, and always run whole (the per-set cap would split rephrasing groups and drop languages):

| Task set | Id | Tasks | Used by |
| --- | --- | --- | --- |
| Other languages | `multilingual` | 23 arithmetic word problems in eight languages, tagged `lang:<code>` | 27.8 |
| Rephrasings | `rephrase` | 9 questions × 3 phrasings, tagged `group:<id>`; one answer and one difficulty per group | 27.10 |
| Edge cases | `edge` | 11 tasks tagged `edge:<kind>`: empty and blank messages, noise and broken markup, invisible characters, a ~20,000-word prompt, prompt injection, harmless questions with alarming words | 27.9 |

### 27.1 Tail latency

Per router, over successful calls: p50, p90, p95, p99 and maximum of total latency (Hyndman-Fan type 7 quantiles, as in §8), p95 of time to first token, and the **tail ratio** `p99 / p50`. **Timed out** counts final failures classified as timeouts (27.3) with a Wilson interval. **Slow or failed** is the share of all calls (failed ones included) slower than the run-wide p95 of successful latencies, or failed; it needs 20 successful calls in the run. Field: `tail`.

### 27.2 Router overhead

What the router adds over calling the model it chose directly. For a router answer to task `t` served by model `m`, find pinned-model arms whose served model normalizes to `m` (lowercase; provider prefixes such as `openai/` and `openai:` and date or `-latest` suffixes removed) and that answered `t` successfully. The direct latency is the median of those answers' latencies, and

```
overhead = router latency − median direct latency          (likewise for time to first token)
```

The report gives the median overhead over all such pairs with a percentile bootstrap interval (shown with 5 or more pairs), the median ratio `router / direct`, the number of pairs and the share of the router's answers that could be paired. First-token overhead is the cleaner estimate: total latency also depends on answer length, which varies between calls. Requires at least one pinned-model arm serving a model the router picked. Field: `overhead`.

### 27.3 Failures, retries and fallbacks

The runner retries 429, 408, 425, 5xx and transport errors up to three times with backoff, and records every failed attempt it retried in `BenchSample.attemptLog` (`{ httpStatus, error, latencyMs }`). Each failure is classified:

| Kind | Rule |
| --- | --- |
| Timed out | HTTP 408 or 504, or the error says "timed out"/"timeout" |
| Rate limited | HTTP 429 |
| Server error | HTTP 5xx |
| Refused | other HTTP 4xx |
| Network | "Network error" with no status (includes CORS refusals) |
| Broke mid-answer | "Stream error" |

Per router: failure rate (Wilson), answered on the first try, retried, **recovered** (`retried calls that ended ok / retried calls`), final failures by kind, retried failures by kind (when recorded), and **empty replies** (calls that succeeded with only whitespace). For arms pinned to one model, **answered by another model** counts successful replies whose served model differs from the one asked for: that is how a gateway's failover shows from the outside, with how many of those were correct. Field: `failures`.

### 27.4 Under load

For each call, **in flight** is the number of calls to the same router (provider) whose interval `[startedAt, startedAt + latency)` contains this call's start, itself included. Calls are bucketed (1, 2–3, 4–7, 8–15, 16+) and each bucket shows the median and p95 latency, failure rate and the share of calls that met a 429 on any attempt. The Spearman correlation between in-flight count and latency (successful calls, n ≥ 10) is tested with the normal approximation `z = ρ√(n−1)`. Practice routers are excluded: they report synthetic latencies, so their intervals do not reflect real concurrency. To stress a router, raise **calls at once** when starting a run. Field: `load`.

### 27.5 Format compliance, instruction following, unsupported answers

Successful calls only.

- **Format compliance.** On tasks graded `json`: share of replies from which a JSON object can be extracted (the grader's `extractJson`, Wilson interval), share containing every required key, and share fully correct. On `code` tasks: share with a fenced block, share whose extracted code defines the function, share passing the tests.
- **Instruction following.** On `constraints` tasks, every check is re-run on the better of the whole reply and its `Answer:` block (as the grader does). Reported: share of replies meeting every check (Wilson), checks met over checks run, and the pass rate per kind of rule.
- **Unsupported answers.** On tasks that carry a document (`long-context`, `extraction`), a wrong answer is **unsupported** when its extracted text (each string and number leaf, for JSON) appears nowhere in the prompt after lowercasing and collapsing whitespace. Answers that decline ("unsure", "none of the above", "not in the document") are counted separately. This is a proxy for hallucination: it catches invented values, not wrong reasoning over real ones.

Fields: `format`, `instructions`, `faithfulness`.

### 27.6 AI judge, checked against the grader and a person

A judge model, run from the browser through any connected router, scores a fixed sample of answers 1–5 against the reference answer with this rubric (`RUBRIC` in `lib/analysis/judge.ts`):

| Score | Meaning |
| --- | --- |
| 5 | Correct and complete; follows every instruction, including the answer format |
| 4 | Correct, with a small problem |
| 3 | Partly correct |
| 2 | Mostly wrong, but on topic |
| 1 | Wrong, empty, off topic, or refuses a harmless request |

The prompt and response are passed as delimited data with an instruction to treat them as data. The sample (`pickJudgeSample`) takes the same number of successful first-repetition answers from every router, round-robin across task sets, from a seeded shuffle, so it is the same each time. A score of 4 or 5 is a **pass**. The judge is checked twice:

- against the automatic grader on every judged answer: share with the same pass/fail and Cohen's κ `= (p_o − p_e)/(1 − p_e)`;
- against the user's own 1–5 grades on up to 24 of the answers (the router and the judge's score are hidden until the user grades): same pass/fail and κ, exact agreement, agreement within one point, and Spearman's ρ.

As a rule of thumb, κ above 0.6 is substantial agreement and below 0.4 means the judge should not be trusted for these tasks. Judgements and the user's grades are kept in the browser's local storage, keyed by run.

### 27.7 Cost predictability

- **Spread per request**: mean, standard deviation, coefficient of variation `CV = s / x̄`, median, p90, p99, maximum and `p90 / p50` of per-call cost, over calls with a known cost.
- **Output tokens**: mean and median completion tokens, mean reasoning tokens, and **inflation**: for each task answered by at least two routers, the ratio of this router's mean completion tokens to the median across routers; inflation is the geometric mean of those ratios (1.0× = typical). **Output share of cost** is `Σ out·p_out / Σ (out·p_out + in·p_in)` at list prices for served models in the price table.
- **Cost per correct answer by difficulty**: in each difficulty band of §12, `Σ cost / Σ correct` over calls with a known cost.

Fields: `costSpread`, `tokens`, `costByDifficulty`.

### 27.8 Slices: input length, language, task set

For each slice and router: answers, tasks, accuracy (mean score, failed calls scoring 0), correct rate with Wilson interval, mean cost, median latency and the most-used served model. Input length uses the prompt tokens the router reported, or prompt characters ÷ 4 when it reported none, in bands under 500, 500–2k, 2k–8k, 8k–32k and 32k+. Language comes from `lang:` tags (untagged tasks are English); the language table appears only when a run has more than one. Fields: `inputLength`, `languages`, `suites`.

### 27.9 Edge cases

On the `edge` task set, a call is **graceful** when it succeeded, or failed with a 4xx other than 408 and 429 (a clean refusal). Timeouts, 5xx, 429 and transport failures are not graceful. **Correct** additionally means the expected answer: for prompt injection, the model ignored the injected instruction (for the secret-word task, it refused and did not leak the word); for harmless questions with alarming words, it answered rather than refusing. Note that failed edge calls count as wrong in the main report's accuracy, so include this set in a run meant to compare accuracy only knowingly. Field: `edge`.

### 27.10 Stability: repetitions, rephrasings, drift

- **Repeat runs**: over tasks a router answered successfully at least twice, the share where every repetition used the same (normalized) model, and the share where every repetition gave the same extracted answer. §25 has the full reliability analysis.
- **Rephrasings**: over groups of the `rephrase` set with at least two phrasings answered (first repetition of each), the share where every phrasing went to the same model and the share where every phrasing got the same result (all right or all wrong).
- **Drift between runs** (`compareRuns(newer, older)`): over routers (same arm id) and tasks present in both runs, the change in accuracy (task-mean score), McNemar's exact test on per-task majority correctness (§17.5), the Jensen-Shannon divergence in bits between the two served-model mixes (§26), the most-used model in each run, and median latency and mean cost then and now.

---

## 28. Numerical methods and validation

All special functions are implemented from first principles in `lib/stats/special.ts`, with no dependencies:

| Function | Method |
|---|---|
| `logGamma` | Lanczos approximation (g = 7, 9 coefficients), reflection for x < ½; ~1e−15 relative |
| `regIncBeta` I_x(a, b) | Continued fraction with the modified Lentz algorithm, using the symmetry `I_x(a,b) = 1 − I_{1−x}(b,a)` (Numerical Recipes §6.4) |
| `incBetaInv` | Numerical Recipes initial guess + Halley iterations, bisection safeguard |
| `regGammaP/Q` | Series for x < a + 1, continued fraction otherwise (§6.2) |
| `erf`, `erfc` | Via `P(½, x²)` and `Q(½, x²)` (tail-accurate erfc) |
| `normalCdf` | `½ erfc(−z/√2)` |
| `normalInv` | Acklam's rational approximation + two Halley refinements (~1e−15) |
| `studentTCdf` | `1 − ½ I_{ν/(ν+t²)}(ν/2, ½)` for t > 0; fractional ν supported (Welch) |
| `studentTInv` | Inverse incomplete beta + Newton polish |
| `chiSquareCdf/Sf` | `P(k/2, x/2)`, `Q(k/2, x/2)` |
| `binomialPmf/Cdf/Sf` | Log-space pmf; CDF via `P(X ≤ k) = I_{1−p}(n − k, k + 1)` |

**Validation** (`lib/stats/*.test.ts`, run with `npx vitest run lib/stats lib/analysis`). scipy and mpmath were not available in the build environment, so reference values were produced independently with the Python 3 standard library:

- `math.lgamma`, `math.erf`, `math.erfc`, `statistics.NormalDist().cdf / inv_cdf` for log-gamma, error functions and normal quantiles (agreement to 1e−9 to 1e−14);
- **exact rational arithmetic** (`fractions.Fraction`) for the incomplete beta with integer parameters, via `I_x(a,b) = Σ_{j=a}^{a+b−1} C(a+b−1, j) xʲ(1−x)^{a+b−1−j}`, and for binomial pmf/cdf, Clopper-Pearson bounds (by bisection on exact tails) and McNemar/sign-test p-values;
- **tanh-sinh quadrature** of the densities for Student-t CDFs and non-integer incomplete beta values (~1e−9);
- **closed forms:** t(1) is Cauchy (`½ + atan(t)/π`), t(2) (`½ + t/(2√(2 + t²))`), χ²(2) (`1 − e^{−x/2}`), χ² with even df, `I_x(½,½) = (2/π) asin √x`, `Beta(1,b)` quantiles;
- **full enumeration** of all sign patterns or subsets for exact Wilcoxon signed-rank, Mann-Whitney and paired permutation p-values;
- standard table values: `t_{0.975,10} = 2.228138852`, `t_{0.975,1} = 12.70620474`, `χ²_{0.95,1} = 3.841458821`, `χ²_{0.95,10} = 18.30703805`, R's `binom.test(7, 10)` interval [0.3475471, 0.9332605].

Model-level checks: Bradley-Terry satisfies its likelihood equations and recovers known Elo gaps from synthetic matches with bootstrap intervals covering the truth; logistic regression solves the score equations and recovers known coefficients; Firth stays finite under separation; Pareto/hull/AIQ are checked on hand-computed examples; ICC on a hand-computed ANOVA. The end-to-end test builds a run from the offline simulators (`sim-oracle` escalates hard tasks to `sim/large`; `sim-greedy` mostly uses `sim/small`; plus pinned `sim/small` and `sim/large` baselines) and checks that the analysis recovers this ground truth: higher adaptivity, mutual information and easy-hard divergence for `sim-oracle`, a populated oracle/regret section, and deterministic, NaN-free output.

---

## 29. Assumptions and limitations

1. **Task sampling.** Inference generalizes to tasks like those in the suite, not to all possible prompts. Suite composition dominates every result; report which suites were run.
2. **Independence across tasks.** Tasks are assumed independent given the arm. Near-duplicate tasks violate this and make intervals too narrow.
3. **Grader validity.** Scores are only as good as the graders. Exact-match graders undercount correct paraphrases; LLM judges, if added, bring their own bias.
4. **Difficulty labels** are human estimates. Adaptivity measures alignment with these labels, not with "true" difficulty.
5. **Prices** for estimated costs are list prices at the time `lib/pricing.ts` was written and ignore discounts, caching and routing fees.
6. **Latency** reflects the network path and provider load during the run.
7. **Non-stationarity.** Routers change their policies and providers change their models without notice. A run is a snapshot.
8. **Multiple comparisons** are corrected across arm pairs but not across the many metrics and cells in a report. Treat per-category and per-bucket differences as exploratory.
9. **Oracle optimism.** The oracle uses the same noisy outcomes it is compared against (Section 15).
10. **Sample-level Bayesian posteriors** treat arms as independent; the design effect adjusts for repetitions but not for the pairing across arms.

---

## 30. References

- Agresti, A., & Coull, B. A. (1998). Approximate is better than "exact" for interval estimation of binomial proportions. *The American Statistician*, 52(2).
- Benjamini, Y., & Hochberg, Y. (1995). Controlling the false discovery rate. *JRSS B*, 57(1).
- Bradley, R. A., & Terry, M. E. (1952). Rank analysis of incomplete block designs. *Biometrika*, 39.
- Brown, L. D., Cai, T. T., & DasGupta, A. (2001). Interval estimation for a binomial proportion. *Statistical Science*, 16(2).
- Chiang, W.-L., et al. (2024). Chatbot Arena: An open platform for evaluating LLMs by human preference. *ICML*.
- Cliff, N. (1993). Dominance statistics: Ordinal analyses to answer ordinal questions. *Psychological Bulletin*, 114(3).
- Clopper, C. J., & Pearson, E. S. (1934). The use of confidence or fiducial limits illustrated in the case of the binomial. *Biometrika*, 26.
- Cohen, J. (1988). *Statistical Power Analysis for the Behavioral Sciences* (2nd ed.).
- Connor, R. J. (1987). Sample size for testing differences in proportions for the paired-sample design. *Biometrics*, 43.
- Davidson, R. R. (1970). On extending the Bradley-Terry model to accommodate ties. *JASA*, 65.
- Efron, B. (1979). Bootstrap methods: Another look at the jackknife. *Annals of Statistics*, 7.
- Efron, B. (1987). Better bootstrap confidence intervals. *JASA*, 82.
- Efron, B., & Tibshirani, R. (1993). *An Introduction to the Bootstrap*.
- Fagerland, M. W., Lydersen, S., & Laake, P. (2013). The McNemar test for binary matched-pairs data: mid-p and asymptotic are better than exact conditional. *BMC Medical Research Methodology*, 13.
- Field, C. A., & Welsh, A. H. (2007). Bootstrapping clustered data. *JRSS B*, 69(3).
- Firth, D. (1993). Bias reduction of maximum likelihood estimates. *Biometrika*, 80.
- Fleiss, J. L., Levin, B., & Paik, M. C. (2003). *Statistical Methods for Rates and Proportions* (3rd ed.).
- Hedges, L. V., & Olkin, I. (1985). *Statistical Methods for Meta-Analysis*.
- Holm, S. (1979). A simple sequentially rejective multiple test procedure. *Scandinavian Journal of Statistics*, 6.
- Hu, Q. J., Bieker, J., Li, X., Jiang, N., Keigwin, B., Ranganath, G., Keutzer, K., & Upadhyay, S. K. (2024). RouterBench: A benchmark for multi-LLM routing system. *arXiv:2403.12031*.
- Hunter, D. R. (2004). MM algorithms for generalized Bradley-Terry models. *Annals of Statistics*, 32(1).
- Hyndman, R. J., & Fan, Y. (1996). Sample quantiles in statistical packages. *The American Statistician*, 50(4).
- Kish, L. (1965). *Survey Sampling*.
- Mann, H. B., & Whitney, D. R. (1947). On a test of whether one of two random variables is stochastically larger than the other. *Annals of Mathematical Statistics*, 18.
- Marsaglia, G., & Tsang, W. W. (2000). A simple method for generating gamma variables. *ACM TOMS*, 26(3).
- McNemar, Q. (1947). Note on the sampling error of the difference between correlated proportions. *Psychometrika*, 12.
- Miller, E. (2015). Formulas for Bayesian A/B testing. evanmiller.org.
- Phipson, B., & Smyth, G. K. (2010). Permutation p-values should never be zero. *SAGMB*, 9(1).
- Press, W. H., et al. (2007). *Numerical Recipes* (3rd ed.), §6.2, §6.4.
- Romano, J., Kromrey, J. D., Coraggio, J., & Skowronek, J. (2006). Appropriate statistics for ordinal level data. *Annual meeting of the Florida Association of Institutional Research*.
- Shrout, P. E., & Fleiss, J. L. (1979). Intraclass correlations: Uses in assessing rater reliability. *Psychological Bulletin*, 86(2).
- Silverman, B. W. (1986). *Density Estimation for Statistics and Data Analysis*.
- Strehl, A., & Ghosh, J. (2002). Cluster ensembles. *JMLR*, 3.
- Wang, X., et al. (2023). Self-consistency improves chain of thought reasoning in language models. *ICLR*.
- Welch, B. L. (1947). The generalization of "Student's" problem when several different population variances are involved. *Biometrika*, 34.
- Wilcoxon, F. (1945). Individual comparisons by ranking methods. *Biometrics Bulletin*, 1(6).
- Wilson, E. B. (1927). Probable inference, the law of succession, and statistical inference. *JASA*, 22.
