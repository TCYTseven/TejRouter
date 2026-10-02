import type { ArmMeta, RunReport } from "@/lib/analysis/types";
import { getProviderSpec } from "@/lib/providers/registry";

/**
 * Per-arm display identity for the report. Colors come from the validated
 * categorical palette (components/charts/viz.module.css): an arm whose registry
 * color is a palette slot keeps that slot (so "Enclave is orange" everywhere);
 * extra arms of the same provider, and arms with off-palette colors, take the
 * next unused slot in fixed order. Never cycled; past 8 arms the raw arm color is used.
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

const SLOT_HEX = [
  ["#3987e5", "#2a78d6"],
  ["#d95926", "#eb6834"],
  ["#199e70", "#1baf7a"],
  ["#c98500", "#eda100"],
  ["#d55181", "#e87ba4"],
  ["#008300"],
  ["#9085e9", "#4a3aa7"],
  ["#e66767", "#e34948"],
];

function slotOf(hex: string): number {
  const h = hex.trim().toLowerCase();
  return SLOT_HEX.findIndex((s) => s.includes(h));
}

export function buildArms(report: RunReport): ArmMap {
  const metas = report.meta.arms;
  const slots: (number | null)[] = metas.map(() => null);
  const used = new Set<number>();
  metas.forEach((a, i) => {
    const s = slotOf(a.color);
    if (s >= 0 && !used.has(s)) {
      slots[i] = s;
      used.add(s);
    }
  });
  metas.forEach((_, i) => {
    if (slots[i] != null) return;
    for (let s = 0; s < 8; s++) {
      if (!used.has(s)) {
        slots[i] = s;
        used.add(s);
        return;
      }
    }
  });
  const out: ArmMap = {};
  metas.forEach((a, i) => {
    const spec = getProviderSpec(a.providerId);
    out[a.id] = {
      id: a.id,
      index: i,
      label: a.label || a.id,
      color: slots[i] != null ? `var(--viz-s${slots[i]! + 1})` : a.color,
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
