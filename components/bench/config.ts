import type { BenchRunConfig, SuiteInfo } from "@/lib/bench/types";
import type { ProviderStatus } from "@/lib/types";
import { armId } from "@/lib/bench/arms";

/** One arm row in the builder. `key` is a local instance id; model "" = router default. */
export interface ArmDraft {
  key: string;
  providerId: string;
  model: string;
}

/** Launcher form state, persisted to localStorage. */
export interface LauncherConfig {
  /** null = every suite. */
  suiteIds: string[] | null;
  /** null = defaults from the configured providers. */
  arms: ArmDraft[] | null;
  repetitions: number;
  concurrency: number;
  temperature: number;
  /** null = provider default. */
  maxTokens: number | null;
  /** null = random per run (the server picks and records it). */
  seed: number | null;
  /** null = all tasks. */
  maxTasksPerSuite: number | null;
  name: string;
}

export const DEFAULT_CONFIG: LauncherConfig = {
  suiteIds: null,
  arms: null,
  repetitions: 1,
  concurrency: 8,
  temperature: 0,
  maxTokens: 1024,
  seed: null,
  maxTasksPerSuite: 10,
  name: "",
};

export const CONFIG_KEY = "tejrouter.bench.launcher.v1";

export function isLauncherConfig(v: unknown): v is LauncherConfig {
  if (!v || typeof v !== "object") return false;
  const c = v as LauncherConfig;
  return typeof c.repetitions === "number" && typeof c.concurrency === "number" && (c.arms === null || Array.isArray(c.arms));
}

export function newArmKey(): string {
  return `arm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Every configured real router at its default model; with none configured, the two simulators. */
export function defaultArms(providers: ProviderStatus[]): ArmDraft[] {
  const real = providers.filter((p) => p.configured && !p.simulated);
  const pick = real.length ? real : providers.filter((p) => p.simulated);
  return pick.map((p) => ({ key: `arm-${p.id}`, providerId: p.id, model: "" }));
}

export const SIM_BASELINES: Omit<ArmDraft, "key">[] = [
  { providerId: "sim-greedy", model: "sim/small" },
  { providerId: "sim-greedy", model: "sim/large" },
];

export function draftArmId(a: Pick<ArmDraft, "providerId" | "model">): string {
  return armId(a.providerId, a.model);
}

export interface Preset {
  id: "quick" | "standard" | "thorough";
  label: string;
  maxTasksPerSuite: number | null;
  repetitions: number;
}

/** Task presets. Suite selection is independent (set under "Customize"). */
export const PRESETS: Preset[] = [
  { id: "quick", label: "Quick", maxTasksPerSuite: 10, repetitions: 1 },
  { id: "standard", label: "Standard", maxTasksPerSuite: null, repetitions: 1 },
  { id: "thorough", label: "Thorough", maxTasksPerSuite: null, repetitions: 3 },
];

export function resolveSuiteIds(c: LauncherConfig, suites: SuiteInfo[]): string[] {
  const all = suites.map((s) => s.id);
  if (c.suiteIds == null) return all;
  return all.filter((id) => c.suiteIds!.includes(id));
}

export function activePreset(c: LauncherConfig): Preset["id"] | null {
  const p = PRESETS.find((p) => (p.maxTasksPerSuite ?? null) === (c.maxTasksPerSuite ?? null) && p.repetitions === c.repetitions);
  return p?.id ?? null;
}

/** Build the POST /api/bench body. Duplicate arms are dropped (the server would drop them too). */
export function toRunConfig(c: LauncherConfig, suites: SuiteInfo[], arms: ArmDraft[]): BenchRunConfig {
  const seen = new Set<string>();
  const uniq = arms.filter((a) => {
    const id = draftArmId(a);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return {
    suiteIds: resolveSuiteIds(c, suites),
    arms: uniq.map((a) => ({ providerId: a.providerId, ...(a.model.trim() ? { model: a.model.trim() } : {}) })),
    repetitions: c.repetitions,
    concurrency: c.concurrency,
    temperature: c.temperature,
    ...(c.maxTokens ? { maxTokens: c.maxTokens } : {}),
    ...(c.seed != null ? { seed: c.seed } : {}),
    ...(c.maxTasksPerSuite ? { maxTasksPerSuite: c.maxTasksPerSuite } : {}),
    ...(c.name.trim() ? { name: c.name.trim() } : {}),
  };
}

/** Display name for a router in a run: the provider name, plus the model when it is fixed. */
export function armName(arm: { label: string; model?: string }): string {
  return arm.model ? arm.label : arm.label.split(" · ")[0];
}
