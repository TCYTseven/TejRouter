import { mulberry32, randInt, shuffleInPlace } from "./rng";
import { quantile, sortedAsc } from "./descriptive";

/**
 * Paired-comparison ratings.
 *
 * Bradley-Terry model (Bradley & Terry 1952): P(i beats j) = pᵢ / (pᵢ + pⱼ), pᵢ > 0.
 * Fitted by the minorization-maximization (MM) algorithm of Hunter (2004):
 *   pᵢ ← Wᵢ / Σ_{j≠i} nᵢⱼ / (pᵢ + pⱼ)
 * where Wᵢ is i's (weighted) number of wins and nᵢⱼ the number of i-vs-j games.
 *
 * Ties are split as half a win for each side (the "ties as half wins" convention;
 * it gives the same strengths as treating each tie as one win plus one loss at half
 * weight, the convention of the LMSYS Chatbot Arena BT fit). Davidson's (1970)
 * explicit tie model is not used: with symmetric half-win scoring the strengths stay
 * interpretable as ordinary BT odds and the MM update keeps its simple closed form.
 *
 * Regularization: each item also plays `prior` virtual games (half won, half lost)
 * against a fixed reference item of strength 1. This is a MAP estimate under a
 * weak symmetric prior; it keeps strengths finite for undefeated or winless items
 * and makes the scale identifiable. Use prior = 0 for the plain MLE.
 *
 * Elo scale: Rᵢ = 1000 + (400 / ln 10) · (ln pᵢ - mean_k ln p_k), so a 400-point gap
 * means 10:1 odds, matching the chess/LMSYS-Arena convention.
 */

export interface PairwiseMatch {
  a: string;
  b: string;
  /** Outcome for a: 1 = a wins, 0 = b wins, 0.5 = tie. */
  scoreA: number;
  /** Optional weight (default 1). */
  weight?: number;
  /** Resampling unit for the bootstrap (task id, vote id, ...). Defaults to one group per match. */
  group?: string;
}

export interface BradleyTerryOptions {
  /** Virtual games against a strength-1 reference per item (default 1). */
  prior?: number;
  maxIterations?: number;
  tolerance?: number;
}

export interface BradleyTerryFit {
  items: string[];
  /** Strengths pᵢ normalized to geometric mean 1. */
  strengths: number[];
  /** Elo-scale ratings, mean 1000. */
  ratings: number[];
  iterations: number;
  converged: boolean;
  logLikelihood: number;
}

const ELO_SCALE = 400 / Math.LN10;

interface Aggregate {
  wins: Float64Array;
  /** Upper-triangular pair counts, index i*k + j for i < j. */
  games: Float64Array;
}

function aggregate(items: string[], matches: PairwiseMatch[]): Aggregate {
  const k = items.length;
  const index = new Map(items.map((id, i) => [id, i]));
  const wins = new Float64Array(k);
  const games = new Float64Array(k * k);
  for (const m of matches) {
    const i = index.get(m.a);
    const j = index.get(m.b);
    if (i === undefined || j === undefined || i === j) continue;
    const w = m.weight ?? 1;
    const s = Math.min(1, Math.max(0, m.scoreA));
    wins[i] += w * s;
    wins[j] += w * (1 - s);
    games[i < j ? i * k + j : j * k + i] += w;
  }
  return { wins, games };
}

function fitAggregate(k: number, agg: Aggregate, opts: BradleyTerryOptions): { p: number[]; iterations: number; converged: boolean } {
  const prior = opts.prior ?? 1;
  const maxIt = opts.maxIterations ?? 10000;
  const tol = opts.tolerance ?? 1e-10;
  const p = new Array<number>(k).fill(1);
  let converged = false;
  let it = 0;
  for (; it < maxIt; it++) {
    let maxDelta = 0;
    for (let i = 0; i < k; i++) {
      let denom = prior > 0 ? prior / (p[i] + 1) : 0;
      for (let j = 0; j < k; j++) {
        if (j === i) continue;
        const nij = agg.games[i < j ? i * k + j : j * k + i];
        if (nij > 0) denom += nij / (p[i] + p[j]);
      }
      const num = agg.wins[i] + prior / 2;
      const next = denom > 0 ? Math.max(num / denom, 1e-300) : p[i];
      const delta = Math.abs(Math.log(next) - Math.log(p[i]));
      if (delta > maxDelta) maxDelta = delta;
      p[i] = next;
    }
    if (prior <= 0) {
      // Plain MLE: fix the scale (geometric mean 1) every sweep.
      let lg = 0;
      for (const x of p) lg += Math.log(x);
      const g = Math.exp(lg / k);
      for (let i = 0; i < k; i++) p[i] /= g;
    }
    if (maxDelta < tol) {
      converged = true;
      it++;
      break;
    }
  }
  return { p, iterations: it, converged };
}

function finish(items: string[], p: number[], agg: Aggregate, iterations: number, converged: boolean): BradleyTerryFit {
  const k = items.length;
  let lg = 0;
  for (const x of p) lg += Math.log(x);
  const meanLog = k ? lg / k : 0;
  const strengths = p.map((x) => Math.exp(Math.log(x) - meanLog));
  const ratings = p.map((x) => 1000 + ELO_SCALE * (Math.log(x) - meanLog));
  let ll = 0;
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const n = agg.games[i * k + j];
      if (!n) continue;
      // Wins of i against j are not stored separately; the log-likelihood uses the
      // sufficient statistics Σᵢ Wᵢ ln pᵢ - Σ_{i<j} nᵢⱼ ln(pᵢ + pⱼ).
      ll -= n * Math.log(p[i] + p[j]);
    }
    ll += agg.wins[i] * Math.log(p[i]);
  }
  return { items, strengths, ratings, iterations, converged, logLikelihood: ll };
}

/** Fit a Bradley-Terry model by MM. */
export function bradleyTerry(items: string[], matches: PairwiseMatch[], opts: BradleyTerryOptions = {}): BradleyTerryFit {
  const agg = aggregate(items, matches);
  const { p, iterations, converged } = fitAggregate(items.length, agg, opts);
  return finish(items, p, agg, iterations, converged);
}

/** Model-implied P(i beats j) from Elo-scale ratings. */
export function eloWinProbability(ratingI: number, ratingJ: number): number {
  return 1 / (1 + Math.pow(10, (ratingJ - ratingI) / 400));
}

export interface RatingWithCI {
  id: string;
  rating: number;
  lo: number;
  hi: number;
  /** Bootstrap standard error of the rating. */
  se: number;
  /** 1-based rank by point estimate. */
  rank: number;
  /** 95% bootstrap interval for the rank (1 = best). */
  rankLo: number;
  rankHi: number;
  games: number;
  /** Wins with ties counted as ½. */
  score: number;
}

export interface BradleyTerryBootstrap {
  fit: BradleyTerryFit;
  ratings: RatingWithCI[];
  iterations: number;
  /** probability[i][j] = model P(items[i] beats items[j]). */
  winProbability: number[][];
}

/**
 * Bradley-Terry with percentile bootstrap intervals. Matches are resampled by
 * `group` (cluster bootstrap): e.g. all head-to-head outcomes from one task are
 * kept together, since they share that task's difficulty.
 */
export function bradleyTerryBootstrap(
  items: string[],
  matches: PairwiseMatch[],
  opts: BradleyTerryOptions & { iterations?: number; seed?: number; alpha?: number } = {},
): BradleyTerryBootstrap {
  const k = items.length;
  const alpha = opts.alpha ?? 0.05;
  const B = Math.max(0, Math.floor(opts.iterations ?? 1000));
  const fit = bradleyTerry(items, matches, opts);
  // Pre-aggregate each group's sufficient statistics so a resample is a cheap sum.
  const groupsMap = new Map<string, PairwiseMatch[]>();
  matches.forEach((m, i) => {
    const g = m.group ?? `#${i}`;
    let arr = groupsMap.get(g);
    if (!arr) groupsMap.set(g, (arr = []));
    arr.push(m);
  });
  const groupAggs = [...groupsMap.values()].map((ms) => aggregate(items, ms));
  const G = groupAggs.length;
  const samples: number[][] = items.map(() => []);
  const rankSamples: number[][] = items.map(() => []);
  const rand = mulberry32(opts.seed ?? 1);
  for (let b = 0; b < B && G > 0; b++) {
    const agg: Aggregate = { wins: new Float64Array(k), games: new Float64Array(k * k) };
    for (let g = 0; g < G; g++) {
      const src = groupAggs[randInt(rand, G)];
      for (let i = 0; i < k; i++) agg.wins[i] += src.wins[i];
      for (let i = 0; i < k * k; i++) if (src.games[i]) agg.games[i] += src.games[i];
    }
    const r = fitAggregate(k, agg, { ...opts, maxIterations: Math.min(opts.maxIterations ?? 2000, 2000), tolerance: 1e-8 });
    const ratings = finish(items, r.p, agg, r.iterations, r.converged).ratings;
    const order = ratings.map((_, i) => i).sort((x, y) => ratings[y] - ratings[x]);
    order.forEach((i, pos) => rankSamples[i].push(pos + 1));
    ratings.forEach((v, i) => samples[i].push(v));
  }
  const fullAgg = aggregate(items, matches);
  const games = items.map((_, i) => {
    let n = 0;
    for (let j = 0; j < k; j++) if (j !== i) n += fullAgg.games[i < j ? i * k + j : j * k + i];
    return n;
  });
  const order = fit.ratings.map((_, i) => i).sort((x, y) => fit.ratings[y] - fit.ratings[x]);
  const rankOf = new Array<number>(k);
  order.forEach((i, pos) => (rankOf[i] = pos + 1));
  const ratings: RatingWithCI[] = items.map((id, i) => {
    const s = sortedAsc(samples[i]);
    const rs = sortedAsc(rankSamples[i]);
    const m = s.length ? s.reduce((x, y) => x + y, 0) / s.length : NaN;
    const se = s.length > 1 ? Math.sqrt(s.reduce((acc, v) => acc + (v - m) * (v - m), 0) / (s.length - 1)) : NaN;
    return {
      id,
      rating: fit.ratings[i],
      lo: s.length ? quantile(s, alpha / 2, true) : NaN,
      hi: s.length ? quantile(s, 1 - alpha / 2, true) : NaN,
      se,
      rank: rankOf[i],
      rankLo: rs.length ? Math.round(quantile(rs, alpha / 2, true)) : NaN,
      rankHi: rs.length ? Math.round(quantile(rs, 1 - alpha / 2, true)) : NaN,
      games: games[i],
      score: fullAgg.wins[i],
    };
  });
  const winProbability = items.map((_, i) => items.map((__, j) => (i === j ? 0.5 : fit.strengths[i] / (fit.strengths[i] + fit.strengths[j]))));
  return { fit, ratings, iterations: B, winProbability };
}

/**
 * Online (sequential) Elo: Rₐ ← Rₐ + K(Sₐ - Eₐ), Eₐ = 1/(1 + 10^((R_b - Rₐ)/400)).
 * Order-dependent, so by default the ratings are averaged over `shuffles` seeded
 * random orderings of the matches (as in the LMSYS Chatbot Arena notebook).
 * Pass shuffles = 0 to process the matches in the given order.
 */
export function onlineElo(
  items: string[],
  matches: PairwiseMatch[],
  opts: { k?: number; initial?: number; shuffles?: number; seed?: number } = {},
): Record<string, number> {
  const K = opts.k ?? 16;
  const init = opts.initial ?? 1000;
  const shuffles = opts.shuffles ?? 50;
  const rand = mulberry32(opts.seed ?? 1);
  const run = (ms: PairwiseMatch[]) => {
    const r = new Map(items.map((id) => [id, init]));
    for (const m of ms) {
      const ra = r.get(m.a);
      const rb = r.get(m.b);
      if (ra === undefined || rb === undefined || m.a === m.b) continue;
      const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
      const w = m.weight ?? 1;
      r.set(m.a, ra + K * w * (m.scoreA - ea));
      r.set(m.b, rb - K * w * (m.scoreA - ea));
    }
    return r;
  };
  const out: Record<string, number> = Object.fromEntries(items.map((id) => [id, 0]));
  if (shuffles <= 0) {
    const r = run(matches);
    for (const id of items) out[id] = r.get(id)!;
    return out;
  }
  for (let s = 0; s < shuffles; s++) {
    const r = run(shuffleInPlace(rand, matches.slice()));
    for (const id of items) out[id] += r.get(id)! / shuffles;
  }
  return out;
}
