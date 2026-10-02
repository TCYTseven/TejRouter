import type { ArmMeta, RunReport } from "@/lib/analysis/types";
import { getProviderSpec } from "@/lib/providers/registry";

/**
 * Per-arm display identity for the report. Colors come from the validated
 * categorical palette (components/charts/viz.module.css), assigned in fixed
 * order by the arm's position in the run, so the palette's adjacent-pair
 * colorblind checks hold. Never cycled; past 8 arms the raw arm color is used
 * (identity is then carried by the name next to every swatch).
 */

export interface ArmInfo {
  id: string;
  index: number;
  label: string;
  color: string;
  kind: ArmMeta["kind"];
  kindReason: string;
  providerId: string;
  providerName: string;
  model: string | null;
  simulated: boolean;
}

export type ArmMap = Record<string, ArmInfo>;

export function buildArms(report: RunReport): ArmMap {
  const metas = report.meta.arms;
  const out: ArmMap = {};
  metas.forEach((a, i) => {
    const spec = getProviderSpec(a.providerId);
    out[a.id] = {
      id: a.id,
      index: i,
      label: a.label || a.id,
      color: i < 8 ? `var(--viz-s${i + 1})` : a.color,
      kind: a.kind,
      kindReason: a.kindReason,
      providerId: a.providerId,
      providerName: spec?.name ?? a.providerId,
      model: a.model,
      simulated: !!spec?.simulated,
    };
  });
  return out;
}

/** Fallback for ids missing from meta (should not happen). */
export function armOf(arms: ArmMap, id: string): ArmInfo {
  return (
    arms[id] ?? {
      id,
      index: 99,
      label: id,
      color: "var(--fg-subtle)",
      kind: "router",
      kindReason: "",
      providerId: id,
      providerName: id,
      model: null,
      simulated: false,
    }
  );
}
