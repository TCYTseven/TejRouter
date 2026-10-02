import type { ChatResult, ProviderStatus } from "@/lib/types";
import type { ArenaVote } from "@/lib/client/arena-votes";

/** One configured column in the arm picker. `key` is a local instance id. */
export interface ArmConfig {
  key: string;
  providerId: string;
  /** "" means the provider default / auto model. */
  model: string;
}

export interface GenSettings {
  temperature: number;
  maxTokens: number;
  /** null = no seed */
  seed: number | null;
  repeat: number;
  blind: boolean;
}

export type RepStatus = "pending" | "streaming" | "done" | "error" | "aborted";

export interface RepRun {
  rep: number;
  status: RepStatus;
  text: string;
  result: ChatResult | null;
}

export interface ArmRound {
  key: string;
  /** `${providerId}:${model || "default"}` */
  armId: string;
  providerId: string;
  model: string;
  /** "A", "B", ... in display order. */
  letter: string;
  reps: RepRun[];
}

export interface Round {
  id: string;
  prompt: string;
  system: string;
  startedAt: number;
  finishedAt: number | null;
  settings: GenSettings;
  arms: ArmRound[];
  vote: ArenaVote | null;
  aborted: boolean;
}

export type ProviderMap = Record<string, ProviderStatus>;

export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function armDone(a: ArmRound): boolean {
  return a.reps.every((r) => r.status === "done" || r.status === "error" || r.status === "aborted");
}

export function okResults(a: ArmRound): ChatResult[] {
  return a.reps.map((r) => r.result).filter((r): r is ChatResult => !!r && r.ok);
}

/** The rep shown in a column: the one streaming, else the last with output. */
export function currentRep(a: ArmRound): RepRun {
  return (
    a.reps.find((r) => r.status === "streaming") ??
    [...a.reps].reverse().find((r) => r.status !== "pending") ??
    a.reps[0]
  );
}
