"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconCheckCircle, IconEqual, IconThumbDown, IconTrophy } from "@/components/ui/icons";
import { ProviderDot } from "@/components/ui/provider";
import { useToast } from "@/components/ui/toast";
import { deleteVote, saveVote, type ArenaWinner } from "@/lib/client/arena-votes";
import type { ArmRound, ProviderMap, Round } from "./types";

/** Arena vote bar shown after a round completes. */
export function VotePanel({
  round,
  providers,
  onVote,
}: {
  round: Round;
  providers: ProviderMap;
  onVote: (vote: Round["vote"]) => void;
}) {
  const toast = useToast();
  const blind = round.settings.blind;
  const vote = round.vote;
  const name = (a: ArmRound) => providers[a.providerId]?.name ?? a.providerId;

  const cast = (winner: ArenaWinner) => {
    const v = saveVote({ prompt: round.prompt, armIds: round.arms.map((a) => a.armId), winner });
    onVote(v);
    toast({
      title: "Vote recorded",
      description: blind ? "Identities revealed. See the Arena for the leaderboard." : "Counts toward the Arena leaderboard.",
      tone: "success",
    });
  };

  const undo = () => {
    if (!vote) return;
    deleteVote(vote.id);
    onVote(null);
    toast({ title: "Vote removed" });
  };

  if (vote) {
    const winner = round.arms.find((a) => a.armId === vote.winner);
    return (
      <section aria-label="Arena vote" className="flex animate-rise flex-wrap items-center gap-3 rounded-lg border border-accent-line bg-accent-soft px-4 py-3">
        <IconCheckCircle size={18} className="text-accent-text" />
        <p className="flex-1 text-sm text-fg">
          {vote.winner === "tie" ? (
            "You called it a tie."
          ) : vote.winner === "all-bad" ? (
            "You marked every response as bad."
          ) : winner ? (
            <>
              You picked <strong className="font-semibold">Router {winner.letter}</strong>
              {blind ? (
                <>
                  {" "}
                  which was <ProviderDot provider={providers[winner.providerId]} className="mx-0.5" /> <strong className="font-semibold">{name(winner)}</strong>
                  {winner.model ? <span className="font-mono text-xs text-fg-muted"> ({winner.model})</span> : null}
                </>
              ) : (
                <> ({name(winner)})</>
              )}
              .
            </>
          ) : (
            "Vote recorded."
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={undo}>
            Undo
          </Button>
          <Link href="/arena" className="text-xs font-medium text-accent-text hover:underline">
            Arena leaderboard →
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="vote-title" className="animate-rise rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex items-center gap-2 lg:w-56 lg:shrink-0">
          <IconTrophy size={16} className="text-accent-text" />
          <div>
            <h2 id="vote-title" className="text-sm font-semibold text-fg">
              Which response was best?
            </h2>
            <p className="text-[11px] text-fg-subtle">{blind ? "Blind: names are revealed after you vote." : "Saved locally for the Arena."}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {round.arms.map((a) => (
            <Button key={a.key} size="md" variant="secondary" onClick={() => cast(a.armId)} className="max-w-full">
              <span className="num flex h-4 w-4 items-center justify-center rounded border border-border-strong text-[9px]">{a.letter}</span>
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
          <Button size="md" variant="outline" onClick={() => cast("tie")} leftIcon={<IconEqual size={14} />}>
            Tie
          </Button>
          <Button size="md" variant="outline" onClick={() => cast("all-bad")} leftIcon={<IconThumbDown size={14} />}>
            All bad
          </Button>
        </div>
      </div>
    </section>
  );
}
