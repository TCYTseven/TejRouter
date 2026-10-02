import { ARENA_VOTES_KEY, isArenaVote, loadVotes, type ArenaVote } from "@/lib/client/arena-votes";
import { writeStorage } from "@/lib/client/storage";

export const EXPORT_FORMAT = "tejrouter.arena.votes";

export interface VoteExport {
  format: typeof EXPORT_FORMAT;
  version: 1;
  exportedAt: string;
  votes: ArenaVote[];
}

export function buildExport(votes: ArenaVote[]): VoteExport {
  return { format: EXPORT_FORMAT, version: 1, exportedAt: new Date().toISOString(), votes };
}

/** Trigger a JSON download in the browser. */
export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface ImportResult {
  added: number;
  duplicates: number;
  invalid: number;
}

/**
 * Parse an export (or a bare array of votes), validate each entry with
 * isArenaVote, and merge into storage by id. Existing votes win on conflicts.
 * Throws on unreadable JSON or an unrecognised shape.
 */
export function importVotes(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The file is not valid JSON.");
  }
  const list: unknown = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { votes?: unknown }).votes)
      ? (parsed as { votes: unknown[] }).votes
      : null;
  if (!Array.isArray(list)) throw new Error("Expected an array of votes or a TejRouter arena export.");
  const existing = loadVotes();
  const ids = new Set(existing.map((v) => v.id));
  const incoming: ArenaVote[] = [];
  let invalid = 0;
  let duplicates = 0;
  for (const item of list) {
    if (!isArenaVote(item)) {
      invalid++;
      continue;
    }
    if (ids.has(item.id)) {
      duplicates++;
      continue;
    }
    ids.add(item.id);
    // Keep only the known fields so stray properties are not persisted.
    incoming.push({ id: item.id, at: item.at, prompt: item.prompt, armIds: [...item.armIds], winner: item.winner });
  }
  if (incoming.length) {
    const merged = [...existing, ...incoming].sort((a, b) => a.at - b.at);
    if (!writeStorage(ARENA_VOTES_KEY, merged)) throw new Error("Browser storage is unavailable or full.");
  }
  return { added: incoming.length, duplicates, invalid };
}
