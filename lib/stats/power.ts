import { normalCdf, normalInv } from "./special";

/**
 * Power analysis for accuracy comparisons (normal approximations).
 * α is two-sided throughout. "n" is the number of independent units (tasks).
 */

const za = (alpha: number) => normalInv(1 - alpha / 2);
const zb = (power: number) => normalInv(power);

/**
 * Per-group sample size to detect p₁ vs p₂ with two independent samples
 * (Fleiss, Levin & Paik 2003, without continuity correction):
 *   n = [z_{1-α/2} √(2p̄q̄) + z_{1-β} √(p₁q₁ + p₂q₂)]² / (p₁ - p₂)²
 */
export function requiredNTwoProportions(p1: number, p2: number, alpha = 0.05, power = 0.8): number {
  const d = Math.abs(p1 - p2);
  if (!(d > 0)) return Infinity;
  const pbar = (p1 + p2) / 2;
  const num = za(alpha) * Math.sqrt(2 * pbar * (1 - pbar)) + zb(power) * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
  return Math.ceil((num * num) / (d * d));
}

/** Approximate power of the two-proportion z-test with n per group. */
export function powerTwoProportions(n: number, p1: number, p2: number, alpha = 0.05): number {
  const d = Math.abs(p1 - p2);
  const pbar = (p1 + p2) / 2;
  const s1 = Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
  if (!(s1 > 0) || !(n > 0)) return NaN;
  return normalCdf((d * Math.sqrt(n) - za(alpha) * Math.sqrt(2 * pbar * (1 - pbar))) / s1);
}

/**
 * Minimum detectable effect (absolute difference in proportions) for two
 * independent groups of size n around baseline p0, found by bisection on
 * requiredN(p0, p0 ± δ) = n. Searches toward 0.5 (the direction with more room).
 */
export function mdeTwoProportions(n: number, p0: number, alpha = 0.05, power = 0.8): number {
  if (!(n > 0)) return NaN;
  const up = p0 <= 0.5;
  const room = up ? 1 - p0 : p0;
  const need = (d: number) => {
    const p1 = up ? p0 + d : p0 - d;
    const pbar = (p0 + p1) / 2;
    const num = za(alpha) * Math.sqrt(2 * pbar * (1 - pbar)) + zb(power) * Math.sqrt(p0 * (1 - p0) + p1 * (1 - p1));
    return (num * num) / (d * d);
  };
  if (need(room) > n) return NaN; // not detectable even at the extreme
  let lo = 1e-9;
  let hi = room;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (need(mid) > n) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * Number of paired units (tasks) for McNemar's test (Connor 1987):
 *   n = [z_{1-α/2} √ψ + z_{1-β} √(ψ - δ²)]² / δ²
 * where ψ = p₁₀ + p₀₁ is the discordance probability and δ = p₁₀ - p₀₁ the accuracy difference.
 */
export function requiredNPairedProportions(delta: number, discordance: number, alpha = 0.05, power = 0.8): number {
  const d = Math.abs(delta);
  if (!(d > 0) || !(discordance >= d)) return Infinity;
  const num = za(alpha) * Math.sqrt(discordance) + zb(power) * Math.sqrt(Math.max(0, discordance - d * d));
  return Math.ceil((num * num) / (d * d));
}

/** Minimum detectable paired accuracy difference with n tasks and discordance ψ. */
export function mdePairedProportions(n: number, discordance: number, alpha = 0.05, power = 0.8): number {
  if (!(n > 0) || !(discordance > 0)) return NaN;
  const need = (d: number) => {
    const num = za(alpha) * Math.sqrt(discordance) + zb(power) * Math.sqrt(Math.max(0, discordance - d * d));
    return (num * num) / (d * d);
  };
  if (need(discordance) > n) return NaN;
  let lo = 1e-9;
  let hi = discordance;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (need(mid) > n) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** MDE for a paired mean difference with sd of differences σ_d: (z_{1-α/2} + z_{1-β}) σ_d / √n. */
export function mdePairedMeans(n: number, sdDiff: number, alpha = 0.05, power = 0.8): number {
  if (!(n > 0)) return NaN;
  return ((za(alpha) + zb(power)) * sdDiff) / Math.sqrt(n);
}

/** Tasks needed to detect a paired mean difference δ given σ_d. */
export function requiredNPairedMeans(delta: number, sdDiff: number, alpha = 0.05, power = 0.8): number {
  if (!(Math.abs(delta) > 0)) return Infinity;
  const v = ((za(alpha) + zb(power)) * sdDiff) / Math.abs(delta);
  return Math.ceil(v * v);
}

/**
 * Kish design effect for m observations per cluster with intraclass correlation ρ:
 * DEFF = 1 + (m - 1)ρ. Effective sample size = n_obs / DEFF.
 */
export function designEffect(clusterSize: number, icc: number): number {
  if (!(clusterSize >= 1) || !Number.isFinite(icc)) return 1;
  return Math.max(1, 1 + (clusterSize - 1) * Math.max(0, icc));
}
