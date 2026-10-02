/**
 * lib/analysis: turns a BenchRun into a RunReport (see ./types.ts) and arena votes
 * into a leaderboard. Methodology: docs/METHODOLOGY.md.
 */
export { analyzeRun, blendedPrice } from "./analyze";
export { computeTejScore, tejComponents, DEFAULT_TEJ_WEIGHTS, TEJ_FORMULA } from "./tejscore";
export { arenaLeaderboard } from "./arena";
export type { ArenaVote, ArenaArmStats, ArenaLeaderboard, ArenaOptions } from "./arena";
export type * from "./types";
