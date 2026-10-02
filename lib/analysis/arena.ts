import { bradleyTerryBootstrap, deriveSeed, onlineElo, wilson, type PairwiseMatch } from "@/lib/stats";
import type { Estimate } from "./types";

/**
 * Playground arena: humans compare responses from several arms to the same prompt
 * and vote. Ratings use the same Bradley-Terry machinery as benchmark runs.
 *
 * Vote semantics:
 * - winner = an arm id: that arm beats every other arm in `armIds` (k - 1 matches).
 * - "tie": every pair of arms in the vote ties (½ win each), each pair weighted 2/k so a
 *   k-arm tie carries the same k-1 games of evidence as a decisive vote.
 * - "all-bad": also every pair ties (no preference revealed); counted separately.
 * All matches from one vote share a bootstrap group, so a multi-arm vote is
 * resampled as a unit.
 */

export interface ArenaVote {
  id: string;
  at: number;
  prompt: string;
  armIds: string[];
  winner: string | "tie" | "all-bad";
}

export interface ArenaArmStats {
  armId: string;
  rating: number | null;
  lo: number | null;
  hi: number | null;
  rank: number;
  rankLo: number | null;
  rankHi: number | null;
  /** Votes the arm appeared in. */
  votes: number;
  wins: number;
  /** Votes where another arm won. */
  losses: number;
  ties: number;
  allBad: number;
  /** wins / votes with a Wilson interval. */
  winRate: Estimate;
  /** wins / (wins + losses), ties excluded. */
  decisiveWinRate: number | null;
  /** Online Elo averaged over seeded shuffles, for comparison. */
  onlineElo: number | null;
}

export interface ArenaLeaderboard {
  totalVotes: number;
  validVotes: number;
  invalidVotes: number;
  bootstrapIterations: number;
  arms: ArenaArmStats[];
  /** Model-implied P(row beats column). */
  winProbability: { armIds: string[]; matrix: number[][] };
  /** Observed head-to-head record: headToHead[i][j] = score of armIds[i] vs armIds[j] (wins + ½ ties). */
  headToHead: { armIds: string[]; score: number[][]; games: number[][] };
}

export interface ArenaOptions {
  bootstrapIterations?: number;
  seed?: number;
  level?: number;
  /** Bradley-Terry prior pseudo-games (default 1). */
  prior?: number;
}

const fin = (x: number | null | undefined): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

export function arenaLeaderboard(votes: ArenaVote[], opts: ArenaOptions = {}): ArenaLeaderboard {
  const level = opts.level ?? 0.95;
  const seed = opts.seed ?? 1;
  const B = Math.max(0, Math.floor(opts.bootstrapIterations ?? 1000));
  const items: string[] = [];
  const seen = new Set<string>();
  const matches: PairwiseMatch[] = [];
  const tally = new Map<string, { votes: number; wins: number; losses: number; ties: number; allBad: number }>();
  const t = (id: string) => {
    let x = tally.get(id);
    if (!x) tally.set(id, (x = { votes: 0, wins: 0, losses: 0, ties: 0, allBad: 0 }));
    return x;
  };
  let valid = 0;
  for (const v of votes) {
    const ids = [...new Set(v.armIds ?? [])];
    const winnerIsArm = v.winner !== "tie" && v.winner !== "all-bad";
    if (ids.length < 2 || (winnerIsArm && !ids.includes(v.winner))) continue;
    valid++;
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        items.push(id);
      }
      t(id).votes++;
    }
    if (winnerIsArm) {
      t(v.winner).wins++;
      for (const id of ids) if (id !== v.winner) {
        t(id).losses++;
        matches.push({ a: v.winner, b: id, scoreA: 1, group: v.id });
      }
    } else {
      for (const id of ids) {
        if (v.winner === "tie") t(id).ties++;
        else t(id).allBad++;
      }
      // A tie among k arms yields k(k-1)/2 pairs; weight each by 2/k so the vote carries
      // the same k-1 games of evidence as a decisive vote over the same arms.
      const weight = 2 / ids.length;
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++)
          matches.push({ a: ids[i], b: ids[j], scoreA: 0.5, weight, group: v.id });
    }
  }
  const k = items.length;
  const idx = new Map(items.map((id, i) => [id, i]));
  const score = items.map(() => new Array<number>(k).fill(0));
  const games = items.map(() => new Array<number>(k).fill(0));
  for (const m of matches) {
    const i = idx.get(m.a)!;
    const j = idx.get(m.b)!;
    score[i][j] += m.scoreA;
    score[j][i] += 1 - m.scoreA;
    games[i][j]++;
    games[j][i]++;
  }
  const bt = k >= 2 ? bradleyTerryBootstrap(items, matches, { iterations: B, seed: deriveSeed(seed, "arena-bt"), alpha: 1 - level, prior: opts.prior }) : null;
  const elo = k >= 2 ? onlineElo(items, matches, { shuffles: 20, seed: deriveSeed(seed, "arena-elo") }) : null;
  const arms: ArenaArmStats[] = items.map((id, i) => {
    const r = bt?.ratings[i];
    const s = t(id);
    const w = wilson(s.wins, s.votes, level);
    return {
      armId: id,
      rating: fin(r?.rating ?? null),
      lo: fin(r?.lo ?? null),
      hi: fin(r?.hi ?? null),
      rank: r?.rank ?? i + 1,
      rankLo: fin(r?.rankLo ?? null),
      rankHi: fin(r?.rankHi ?? null),
      votes: s.votes,
      wins: s.wins,
      losses: s.losses,
      ties: s.ties,
      allBad: s.allBad,
      winRate: { value: fin(w.estimate), lo: fin(w.lo), hi: fin(w.hi), method: "wilson" },
      decisiveWinRate: s.wins + s.losses > 0 ? s.wins / (s.wins + s.losses) : null,
      onlineElo: fin(elo?.[id] ?? null),
    };
  });
  arms.sort((a, b) => a.rank - b.rank);
  return {
    totalVotes: votes.length,
    validVotes: valid,
    invalidVotes: votes.length - valid,
    bootstrapIterations: bt ? bt.iterations : 0,
    arms,
    winProbability: { armIds: items, matrix: bt ? bt.winProbability : items.map(() => items.map(() => 0.5)) },
    headToHead: { armIds: items, score, games },
  };
}
