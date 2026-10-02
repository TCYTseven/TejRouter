import { useMemo } from "react";
import { readStorage, removeStorage, useStoredValue, writeStorage } from "./storage";

/**
 * Arena votes cast in the playground. Stored in localStorage so the /arena
 * leaderboard can compute Bradley-Terry / Elo ratings without a backend.
 *
 * Arm ids follow the BenchArm convention: `${providerId}:${model || "default"}`.
 */

export const ARENA_VOTES_KEY = "tejrouter.arena.votes";

export type ArenaWinner = string | "tie" | "all-bad";

export interface ArenaVote {
  id: string;
  /** Epoch ms when the vote was cast. */
  at: number;
  prompt: string;
  /** Arms shown in the round, in column order. */
  armIds: string[];
  /** Winning arm id, or "tie" / "all-bad". */
  winner: ArenaWinner;
}

export function makeArmId(providerId: string, model?: string | null): string {
  return `${providerId}:${model || "default"}`;
}

export function parseArmId(armId: string): { providerId: string; model: string | null } {
  const i = armId.indexOf(":");
  if (i === -1) return { providerId: armId, model: null };
  const model = armId.slice(i + 1);
  return { providerId: armId.slice(0, i), model: model === "default" ? null : model };
}

export function isArenaVote(v: unknown): v is ArenaVote {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.at === "number" &&
    typeof o.prompt === "string" &&
    Array.isArray(o.armIds) &&
    o.armIds.every((a) => typeof a === "string") &&
    typeof o.winner === "string"
  );
}

function isVoteArray(v: unknown): v is ArenaVote[] {
  return Array.isArray(v);
}

/** All valid votes, oldest first. Invalid entries are dropped. */
export function loadVotes(): ArenaVote[] {
  return readStorage<ArenaVote[]>(ARENA_VOTES_KEY, [], isVoteArray).filter(isArenaVote);
}

/** Append a vote. Returns the stored vote. */
export function saveVote(vote: Omit<ArenaVote, "id" | "at"> & Partial<Pick<ArenaVote, "id" | "at">>): ArenaVote {
  const full: ArenaVote = {
    id: vote.id ?? `vote-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: vote.at ?? Date.now(),
    prompt: vote.prompt,
    armIds: vote.armIds,
    winner: vote.winner,
  };
  writeStorage(ARENA_VOTES_KEY, [...loadVotes(), full]);
  return full;
}

export function deleteVote(id: string): void {
  writeStorage(
    ARENA_VOTES_KEY,
    loadVotes().filter((v) => v.id !== id),
  );
}

export function clearVotes(): void {
  removeStorage(ARENA_VOTES_KEY);
}

const EMPTY: ArenaVote[] = [];

/** Reactive list of votes (re-renders when any tab writes votes). */
export function useArenaVotes(): ArenaVote[] {
  const raw = useStoredValue<ArenaVote[]>(ARENA_VOTES_KEY, EMPTY, isVoteArray);
  return useMemo(() => (raw === EMPTY ? EMPTY : raw.filter(isArenaVote)), [raw]);
}
