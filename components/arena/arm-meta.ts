import type { ArenaArmStats } from "@/lib/analysis/arena";
import { parseArmId } from "@/lib/client/arena-votes";
import { getProviderSpec } from "@/lib/providers/registry";

/** Display identity of an arena arm (`${providerId}:${model}`). */
export interface ArmInfo {
  armId: string;
  providerId: string;
  /** Router display name from the registry, or the raw provider id. */
  name: string;
  /** Pinned model, or null for the router's default. */
  model: string | null;
  color: string;
  simulated: boolean;
}

const cache = new Map<string, ArmInfo>();

export function armInfo(armId: string): ArmInfo {
  const hit = cache.get(armId);
  if (hit) return hit;
  const { providerId, model } = parseArmId(armId);
  const spec = getProviderSpec(providerId);
  const info: ArmInfo = {
    armId,
    providerId,
    name: spec?.name ?? providerId,
    model,
    color: spec?.color ?? "var(--fg-subtle)",
    simulated: Boolean(spec?.simulated),
  };
  cache.set(armId, info);
  return info;
}

/** "OpenRouter · openrouter/auto" for aria labels and tooltips. */
export function armLabel(armId: string): string {
  const a = armInfo(armId);
  return a.model ? `${a.name} (${a.model})` : a.name;
}

/**
 * The leaderboard's matrices are indexed in first-seen order; return the
 * index of each arm in that order so callers can redraw them in rank order.
 */
export function matrixIndex(armIds: string[]): Map<string, number> {
  return new Map(armIds.map((id, i) => [id, i]));
}

/** Rating domain covering every interval and the 1000 reference, padded. */
export function ratingDomain(arms: ArenaArmStats[]): [number, number] {
  let lo = 1000;
  let hi = 1000;
  for (const a of arms) {
    for (const v of [a.lo, a.hi, a.rating]) {
      if (v == null) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  const span = Math.max(40, hi - lo);
  return [lo - span * 0.06, hi + span * 0.06];
}

