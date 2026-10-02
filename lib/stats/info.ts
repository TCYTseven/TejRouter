import { chiSquareSf } from "./special";

/**
 * Information theory on discrete distributions. All quantities are in bits
 * (log base 2). Counts are accepted wherever probabilities are; they are normalized.
 */

const LOG2 = Math.LN2;

function normalize(xs: ArrayLike<number>): number[] {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += Math.max(0, xs[i]);
  const out = new Array<number>(xs.length);
  for (let i = 0; i < xs.length; i++) out[i] = s > 0 ? Math.max(0, xs[i]) / s : 0;
  return out;
}

/** Shannon entropy H(p) = -Σ pᵢ log₂ pᵢ (0 log 0 = 0). */
export function entropy(countsOrProbs: ArrayLike<number>): number {
  const p = normalize(countsOrProbs);
  let h = 0;
  for (const x of p) if (x > 0) h -= x * Math.log2(x);
  return h;
}

/**
 * Normalized entropy H(p) / log₂ K in [0, 1], where K is the number of categories
 * (default: the number with non-zero mass). 0 = always the same outcome,
 * 1 = uniform over the K outcomes. Defined as 0 when K ≤ 1.
 */
export function normalizedEntropy(countsOrProbs: ArrayLike<number>, k?: number): number {
  let kk = k ?? 0;
  if (k === undefined) for (let i = 0; i < countsOrProbs.length; i++) if (countsOrProbs[i] > 0) kk++;
  if (kk <= 1) return 0;
  return entropy(countsOrProbs) / Math.log2(kk);
}

/**
 * Miller-Madow bias-corrected entropy estimate from counts:
 * Ĥ_MM = Ĥ + (K - 1)/(2N ln 2), K = number of non-zero cells.
 */
export function entropyMillerMadow(counts: ArrayLike<number>): number {
  let n = 0;
  let k = 0;
  for (let i = 0; i < counts.length; i++) {
    n += counts[i];
    if (counts[i] > 0) k++;
  }
  if (n <= 0) return 0;
  return entropy(counts) + (k - 1) / (2 * n * LOG2);
}

/** Kullback-Leibler divergence D(p‖q) in bits; Infinity if p puts mass where q has none. */
export function klDivergence(p: ArrayLike<number>, q: ArrayLike<number>): number {
  const pp = normalize(p);
  const qq = normalize(q);
  let d = 0;
  for (let i = 0; i < pp.length; i++) {
    if (pp[i] <= 0) continue;
    if (!(qq[i] > 0)) return Infinity;
    d += pp[i] * Math.log2(pp[i] / qq[i]);
  }
  return d;
}

/**
 * Jensen-Shannon divergence JSD(p, q) = ½D(p‖m) + ½D(q‖m), m = ½(p + q), in bits.
 * Symmetric, always finite, bounded in [0, 1]; √JSD is a metric.
 */
export function jsDivergence(p: ArrayLike<number>, q: ArrayLike<number>): number {
  const pp = normalize(p);
  const qq = normalize(q);
  const n = Math.max(pp.length, qq.length);
  const m = new Array<number>(n);
  for (let i = 0; i < n; i++) m[i] = 0.5 * ((pp[i] ?? 0) + (qq[i] ?? 0));
  let d = 0;
  for (let i = 0; i < n; i++) {
    const a = pp[i] ?? 0;
    const b = qq[i] ?? 0;
    if (a > 0) d += 0.5 * a * Math.log2(a / m[i]);
    if (b > 0) d += 0.5 * b * Math.log2(b / m[i]);
  }
  return Math.min(1, Math.max(0, d));
}

/** JSD between two keyed count maps (keys are aligned; missing keys count 0). */
export function jsDivergenceRecords(p: Record<string, number>, q: Record<string, number>): number {
  const keys = [...new Set([...Object.keys(p), ...Object.keys(q)])];
  return jsDivergence(
    keys.map((k) => p[k] ?? 0),
    keys.map((k) => q[k] ?? 0),
  );
}

export interface Contingency {
  rows: string[];
  cols: string[];
  /** table[i][j] = count of (rows[i], cols[j]). */
  table: number[][];
  n: number;
}

/** Cross-tabulate two parallel label arrays. Row/column order is first appearance. */
export function contingency(xs: ReadonlyArray<string>, ys: ReadonlyArray<string>): Contingency {
  const rows: string[] = [];
  const cols: string[] = [];
  const ri = new Map<string, number>();
  const ci = new Map<string, number>();
  const n = Math.min(xs.length, ys.length);
  const cells: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    let i = ri.get(xs[k]);
    if (i === undefined) {
      i = rows.length;
      ri.set(xs[k], i);
      rows.push(xs[k]);
    }
    let j = ci.get(ys[k]);
    if (j === undefined) {
      j = cols.length;
      ci.set(ys[k], j);
      cols.push(ys[k]);
    }
    cells.push([i, j]);
  }
  const table = rows.map(() => new Array<number>(cols.length).fill(0));
  for (const [i, j] of cells) table[i][j]++;
  return { rows, cols, table, n };
}

export interface MutualInformation {
  /** Plug-in I(X;Y) = H(X) + H(Y) - H(X,Y), bits. */
  mi: number;
  hX: number;
  hY: number;
  hXY: number;
  /** I / √(H(X)H(Y)) (Strehl & Ghosh 2002), in [0, 1]; 0 when either entropy is 0. */
  nmiSqrt: number;
  /** I / min(H(X), H(Y)). */
  nmiMin: number;
  /** Theil's uncertainty coefficient U(Y|X) = I / H(Y): share of Y's entropy explained by X. */
  uncertaintyYgivenX: number;
  /** Miller-Madow-corrected I - (r-1)(c-1)/(2N ln 2), floored at 0. */
  miCorrected: number;
  /** G = 2N·I·ln 2, asymptotically χ² with (r-1)(c-1) df under independence. */
  g: number;
  df: number;
  pValue: number;
  n: number;
}

/** Mutual information and related measures from an r × c table of counts. */
export function mutualInformation(table: number[][]): MutualInformation {
  const c = table.reduce((m, row) => Math.max(m, row.length), 0);
  const rowT = table.map((row) => row.reduce((s, x) => s + x, 0));
  const colT = Array.from({ length: c }, (_, j) => table.reduce((s, row) => s + (row[j] ?? 0), 0));
  const n = rowT.reduce((s, x) => s + x, 0);
  const flat: number[] = [];
  for (const row of table) for (let j = 0; j < c; j++) flat.push(row[j] ?? 0);
  const hX = entropy(rowT);
  const hY = entropy(colT);
  const hXY = entropy(flat);
  const mi = n > 0 ? Math.max(0, hX + hY - hXY) : 0;
  const rr = rowT.filter((x) => x > 0).length;
  const cc = colT.filter((x) => x > 0).length;
  const df = Math.max(0, (rr - 1) * (cc - 1));
  const g = 2 * n * mi * LOG2;
  return {
    mi,
    hX,
    hY,
    hXY,
    nmiSqrt: hX > 0 && hY > 0 ? Math.min(1, mi / Math.sqrt(hX * hY)) : 0,
    nmiMin: hX > 0 && hY > 0 ? Math.min(1, mi / Math.min(hX, hY)) : 0,
    uncertaintyYgivenX: hY > 0 ? Math.min(1, mi / hY) : 0,
    miCorrected: n > 0 ? Math.max(0, mi - df / (2 * n * LOG2)) : 0,
    g,
    df,
    pValue: df > 0 ? chiSquareSf(g, df) : 1,
    n,
  };
}

/** Mutual information between two parallel label arrays. */
export function mutualInformationLabels(xs: ReadonlyArray<string>, ys: ReadonlyArray<string>): MutualInformation {
  return mutualInformation(contingency(xs, ys).table);
}
