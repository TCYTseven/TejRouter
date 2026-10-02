/**
 * Cost-quality geometry: Pareto frontiers, convex hulls and the RouterBench AIQ.
 *
 * A point is (cost, quality): lower cost and higher quality are both better.
 * Hu et al. (2024), "RouterBench: A Benchmark for Multi-LLM Routing System",
 * observe that any two configurations can be mixed at random (route a fraction t
 * of queries with one and 1 - t with the other), so every point on the segment
 * between them is achievable in expectation. The best achievable quality at budget
 * c is therefore the non-decreasing upper convex hull q̂(c) of the points, and the
 * Average Improvement in Quality is
 *   AIQ = 1/(c_max - c_min) ∫_{c_min}^{c_max} q̂(c) dc.
 */

export interface CQPoint {
  id: string;
  cost: number;
  quality: number;
}

/** a dominates b: no worse on both axes and strictly better on at least one. */
export function dominates(a: CQPoint, b: CQPoint): boolean {
  return a.cost <= b.cost && a.quality >= b.quality && (a.cost < b.cost || a.quality > b.quality);
}

function valid(points: CQPoint[]): CQPoint[] {
  return points.filter((p) => Number.isFinite(p.cost) && Number.isFinite(p.quality));
}

/** Pareto-optimal (non-dominated) points, sorted by ascending cost. */
export function paretoFrontier(points: CQPoint[]): CQPoint[] {
  const ps = valid(points);
  return ps.filter((p) => !ps.some((q) => q !== p && dominates(q, p))).sort((a, b) => a.cost - b.cost || b.quality - a.quality);
}

export interface Dominance {
  id: string;
  dominatedBy: string[];
  dominates: string[];
  onFrontier: boolean;
}

/** Full dominance relation among points. */
export function dominanceRelations(points: CQPoint[]): Dominance[] {
  const ps = valid(points);
  return ps.map((p) => {
    const by = ps.filter((q) => q !== p && dominates(q, p)).map((q) => q.id);
    return { id: p.id, dominatedBy: by, dominates: ps.filter((q) => q !== p && dominates(p, q)).map((q) => q.id), onFrontier: by.length === 0 };
  });
}

function cross(o: CQPoint, a: CQPoint, b: CQPoint): number {
  return (a.cost - o.cost) * (b.quality - o.quality) - (a.quality - o.quality) * (b.cost - o.cost);
}

/** Upper convex hull (Andrew's monotone chain), sorted by ascending cost. */
export function upperConvexHull(points: CQPoint[]): CQPoint[] {
  const ps = valid(points)
    .slice()
    .sort((a, b) => a.cost - b.cost || a.quality - b.quality);
  const hull: CQPoint[] = [];
  for (const p of ps) {
    // Same cost: keep only the best quality.
    if (hull.length && hull[hull.length - 1].cost === p.cost) hull.pop();
    while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) >= 0) hull.pop();
    hull.push(p);
  }
  return hull;
}

/**
 * Non-decreasing upper convex hull: the upper hull of the Pareto frontier.
 * Its vertices increase in both cost and quality; q̂(c) is flat after the last vertex.
 */
export function nonDecreasingHull(points: CQPoint[]): CQPoint[] {
  return upperConvexHull(paretoFrontier(points));
}

/**
 * Hull quality q̂(c) at cost c: linear interpolation between hull vertices, the
 * maximum hull quality for c beyond the last vertex, and NaN below the cheapest vertex
 * (that budget is not achievable).
 */
export function hullQualityAt(hull: CQPoint[], c: number, scale: "linear" | "log" = "linear"): number {
  if (hull.length === 0 || !(c >= hull[0].cost)) return NaN;
  const t = (v: number) => (scale === "log" ? Math.log(v) : v);
  for (let i = 0; i + 1 < hull.length; i++) {
    const a = hull[i];
    const b = hull[i + 1];
    if (c <= b.cost) {
      const w = (t(c) - t(a.cost)) / (t(b.cost) - t(a.cost));
      return a.quality + w * (b.quality - a.quality);
    }
  }
  return hull[hull.length - 1].quality;
}

export interface AiqResult {
  aiq: number;
  cMin: number;
  cMax: number;
  hull: CQPoint[];
  scale: "linear" | "log";
}

/**
 * AIQ: mean of the non-decreasing convex hull over [cMin, cMax] (default: the
 * cost range of the points). With scale "log" the hull is built and integrated in
 * log-cost (useful when costs span orders of magnitude; requires costs > 0; note
 * that mixing is linear in cost, so the log version is a descriptive variant).
 * If all points have the same cost, AIQ is the best quality.
 */
export function aiq(points: CQPoint[], opts: { cMin?: number; cMax?: number; scale?: "linear" | "log" } = {}): AiqResult {
  const scale = opts.scale ?? "linear";
  let ps = valid(points);
  if (scale === "log") ps = ps.filter((p) => p.cost > 0);
  const empty: AiqResult = { aiq: NaN, cMin: NaN, cMax: NaN, hull: [], scale };
  if (ps.length === 0) return empty;
  const tf = (v: number) => (scale === "log" ? Math.log(v) : v);
  // Build the hull in transformed coordinates so it is convex in that space.
  const tp = ps.map((p) => ({ ...p, cost: tf(p.cost) }));
  const hullT = nonDecreasingHull(tp);
  const hull = hullT.map((h) => ps.find((p) => p.id === h.id && tf(p.cost) === h.cost) ?? { ...h, cost: scale === "log" ? Math.exp(h.cost) : h.cost });
  const cMin = opts.cMin ?? Math.min(...ps.map((p) => p.cost));
  const cMax = opts.cMax ?? Math.max(...ps.map((p) => p.cost));
  const a = tf(cMin);
  const b = tf(cMax);
  if (!(b > a)) return { aiq: Math.max(...ps.map((p) => p.quality)), cMin, cMax, hull, scale };
  // Exact integral of the piecewise-linear q̂ over [a, b] (q̂ = NaN below the first vertex
  // is treated as 0 quality: those budgets achieve nothing).
  const xs = [a, ...hullT.map((h) => h.cost).filter((x) => x > a && x < b), b];
  const q = (x: number) => {
    const v = hullQualityAt(hullT, x);
    return Number.isFinite(v) ? v : 0;
  };
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const x0 = xs[i];
    const x1 = xs[i + 1];
    if (x1 <= x0) continue;
    if (x1 <= hullT[0].cost) continue; // below the cheapest achievable point: zero quality
    area += 0.5 * (q(x0) + q(x1)) * (x1 - x0);
  }
  return { aiq: area / (b - a), cMin, cMax, hull, scale };
}
