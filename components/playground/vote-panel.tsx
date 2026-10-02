"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ProviderDot } from "@/components/ui/provider";
import { deleteVote, saveVote, type ArenaWinner } from "@/lib/client/arena-votes";
import type { ArmRound, ProviderMap, Round } from "./types";

/** "Which answer was best?" row shown under finished results. */
export function VotePanel({
  round,
  providers,
  onVote,
}: {
  round: Round;
  providers: ProviderMap;
  onVote: (vote: Round["vote"]) => void;
}) {
  const blind = round.settings.blind;
  const vote = round.vote;
  const name = (a: ArmRound) => providers[a.providerId]?.name ?? a.providerId;

  const cast = (winner: ArenaWinner) => {
    onVote(saveVote({ prompt: round.prompt, armIds: round.arms.map((a) => a.armId), winner }));
  };

  const undo = () => {
    if (!vote) return;
    deleteVote(vote.id);
    onVote(null);
  };

  if (vote) {
    const winner = round.arms.find((a) => a.armId === vote.winner);
    const what =
      vote.winner === "tie"
        ? "You called it a tie."
        : vote.winner === "all-bad"
          ? "You marked every answer as bad."
          : winner
            ? blind
              ? `You picked Router ${winner.letter}, which was ${name(winner)}.`
              : `You picked ${name(winner)}.`
            : "Vote saved.";
    return (
      <section aria-label="Your vote" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <p className="text-fg" role="status">
          {what} <span className="text-fg-muted">It counts toward the </span>
          <Link href="/arena" className="text-link hover:underline">
            Leaderboard
          </Link>
          <span className="text-fg-muted">.</span>
        </p>
        <Button size="sm" variant="ghost" onClick={undo}>
          Undo
        </Button>
      </section>
    );
  }

  return (
    <section aria-labelledby="vote-title" className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <h2 id="vote-title" className="text-[15px] font-semibold text-fg">
        Which answer was best?
      </h2>
      <div className="flex flex-wrap gap-2">
        {round.arms.map((a) => (
          <Button key={a.key} size="sm" variant="secondary" onClick={() => cast(a.armId)} className="max-w-full">
            {blind ? (
              `Router ${a.letter}`
            ) : (
              <>
                <ProviderDot provider={providers[a.providerId]} />
                <span className="truncate">{name(a)}</span>
              </>
            )}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => cast("tie")}>
          Tie
        </Button>
        <Button size="sm" variant="ghost" onClick={() => cast("all-bad")}>
          All bad
        </Button>
      </div>
    </section>
  );
}
