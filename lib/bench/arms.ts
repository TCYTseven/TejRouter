import type { BenchArm, BenchRunConfig } from "./types";
import { getProviderSpec } from "@/lib/providers/registry";

/** Stable arm id: `${providerId}:${model || "default"}`. */
export function armId(providerId: string, model?: string): string {
  return `${providerId}:${model?.trim() || "default"}`;
}

function hexToHsl(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * The i-th shade of a base color for providers that appear more than once:
 * index 0 is the base color, then alternately lighter and darker.
 */
export function shade(hex: string, index: number): string {
  if (index === 0) return hex;
  const hsl = hexToHsl(hex);
  if (!hsl) return hex;
  const [h, s, l] = hsl;
  // Alternate lighter/darker steps that stay readable; past those, rotate the hue.
  const lightness = [1, -1, 2, -2, 3, -3]
    .map((k) => l + k * 0.13)
    .filter((x) => x >= 0.16 && x <= 0.86);
  if (index - 1 < lightness.length) return hslToHex(h, s, lightness[index - 1]);
  const extra = index - lightness.length;
  return hslToHex((h + (extra * 0.09) % 1) % 1, s, l);
}

const FALLBACK_COLOR = "#71717a";

type ArmInput = BenchRunConfig["arms"][number] & { label?: string; color?: string };

/**
 * Turn the arms of a run config into full BenchArms: canonical ids, readable labels
 * ("Enclave Cyberouter · cyberouter/auto") and distinct colors. Duplicate arms are dropped.
 * Labels/colors supplied by the caller are kept.
 */
export function normalizeArms(arms: BenchRunConfig["arms"]): BenchArm[] {
  const seen = new Set<string>();
  const unique: ArmInput[] = [];
  for (const a of arms as ArmInput[]) {
    if (!a || typeof a.providerId !== "string" || !a.providerId) continue;
    const id = armId(a.providerId, a.model);
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(a);
  }
  const perProvider = new Map<string, number>();
  return unique.map((a) => {
    const spec = getProviderSpec(a.providerId);
    const model = a.model?.trim() || undefined;
    const idx = perProvider.get(a.providerId) ?? 0;
    perProvider.set(a.providerId, idx + 1);
    const modelLabel = model || spec?.autoModel || "default";
    return {
      id: armId(a.providerId, model),
      providerId: a.providerId,
      ...(model ? { model } : {}),
      label: a.label?.trim() || `${spec?.name ?? a.providerId} · ${modelLabel}`,
      color: a.color?.trim() || shade(spec?.color ?? FALLBACK_COLOR, idx),
    };
  });
}
