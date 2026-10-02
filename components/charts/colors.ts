/**
 * Color helpers for charts. Colors are CSS strings built on the theme tokens in
 * viz.module.css, so every chart follows the light/dark theme without JS.
 */

/** Categorical slot i (0-based) of the reference palette, as a CSS var. */
export function seriesColor(i: number): string {
  return `var(--viz-s${(i % 8) + 1})`;
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** Sequential (one hue, light -> dark) fill for t in [0, 1]. */
export function sequentialFill(t: number): string {
  const p = Math.round(clamp01(t) * 100);
  return `color-mix(in oklab, var(--viz-seq-hi) ${p}%, var(--viz-seq-lo))`;
}

/** Ink that clears contrast on sequentialFill(t). */
export function sequentialInk(t: number): string {
  return clamp01(t) > 0.52 ? "var(--viz-seq-ink-hi)" : "var(--viz-seq-ink-lo)";
}

/** Diverging fill for t in [-1, 1]: negative -> red pole, positive -> blue pole, 0 -> gray. */
export function divergingFill(t: number): string {
  const c = Math.max(-1, Math.min(1, t));
  const p = Math.round(Math.abs(c) * 100);
  const pole = c < 0 ? "var(--viz-div-neg)" : "var(--viz-div-pos)";
  return `color-mix(in oklab, ${pole} ${p}%, var(--viz-div-mid))`;
}

export function divergingInk(t: number): string {
  return Math.abs(t) > 0.55 ? "var(--viz-div-ink)" : "var(--fg)";
}

/** Ordinal step k of n (0 = lightest/cheapest). n <= 7. */
export function ordinalColor(k: number, n: number): string {
  if (n <= 1) return "var(--viz-o4)";
  // Spread n steps across the 7-step ramp.
  const idx = Math.round((k / (n - 1)) * 6) + 1;
  return `var(--viz-o${Math.min(7, Math.max(1, idx))})`;
}

/** Hex -> rgba() for a wash of a concrete color; CSS vars go through color-mix. */
export function wash(color: string, alpha: number): string {
  return `color-mix(in oklab, ${color} ${Math.round(alpha * 100)}%, transparent)`;
}
