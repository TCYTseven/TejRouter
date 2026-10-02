"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IconTrash } from "@/components/ui/icons";
import { ProviderDot } from "@/components/ui/provider";
import { useToast } from "@/components/ui/toast";
import { clearVotes, deleteVote, type ArenaVote } from "@/lib/client/arena-votes";
import { cn } from "@/lib/client/cn";
import { formatDateTime, formatRelativeTime, truncate } from "@/lib/client/format";
import { armInfo, armLabel } from "./arm-meta";
import { useNow } from "./hooks";
import { ExportVotesButton, ImportVotesButton } from "./vote-actions";

const PAGE = 12;

function isoOrUndefined(ts: number): string | undefined {
  const d = new Date(ts);
  return Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
}

function outcome(vote: ArenaVote): string {
  if (vote.winner === "tie") return "Tie";
  if (vote.winner === "all-bad") return "All bad";
  if (!vote.armIds.includes(vote.winner)) return "Not counted";
  return `${armInfo(vote.winner).name} won`;
}

function VoteRow({ vote, now, onDelete }: { vote: ArenaVote; now: number; onDelete: () => void }) {
  const decisive = vote.winner !== "tie" && vote.winner !== "all-bad";
  return (
    <li className="group flex gap-3 py-4">
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[15px] text-fg" title={vote.prompt}>
          {vote.prompt.trim() ? truncate(vote.prompt.trim(), 220) : <span className="text-fg-muted italic">(empty prompt)</span>}
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-fg-muted">
          <span className="font-medium text-fg">{outcome(vote)}</span>
          {vote.armIds.map((id) => {
            const a = armInfo(id);
            const won = decisive && id === vote.winner;
            return (
              <span key={id} title={armLabel(id)} className={cn("inline-flex items-center gap-1.5", won && "text-fg")}>
                <ProviderDot color={a.color} simulated={a.simulated} size={8} />
                {a.name}
              </span>
            );
          })}
          <time dateTime={isoOrUndefined(vote.at)} title={formatDateTime(vote.at)}>
            {now ? formatRelativeTime(vote.at, now) : formatDateTime(vote.at)}
          </time>
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete vote on “${truncate(vote.prompt, 40)}”`}
        title="Delete vote"
        onClick={onDelete}
        className="text-fg-muted hover:text-danger sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
      >
        <IconTrash size={15} />
      </Button>
    </li>
  );
}

/** Newest-first list of votes with delete, clear all (confirmed), import and export. */
export function VoteHistory({ votes }: { votes: ArenaVote[] }) {
  const now = useNow();
  const toast = useToast();
  const [shown, setShown] = useState(PAGE);
  const [confirming, setConfirming] = useState(false);
  const ordered = [...votes].sort((a, b) => b.at - a.at);
  const visible = ordered.slice(0, shown);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 pb-2">
        <p className="text-sm text-fg-muted">Saved in this browser. Deleting a vote updates the rankings.</p>
        <div className="flex flex-wrap items-center gap-2">
          <ExportVotesButton votes={votes} />
          <ImportVotesButton />
          {confirming ? null : (
            <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} disabled={!votes.length}>
              Clear all
            </Button>
          )}
        </div>
      </div>
      {confirming ? (
        <div role="alert" className="my-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3">
          <p className="text-sm text-fg">Delete all {votes.length} votes from this browser? Export first if you want a backup.</p>
          <span className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              autoFocus
              onClick={() => {
                clearVotes();
                setConfirming(false);
                toast({ title: "All votes deleted" });
              }}
            >
              Delete all
            </Button>
          </span>
        </div>
      ) : null}
      <ul className="divide-y divide-border">
        {visible.map((v) => (
          <VoteRow
            key={v.id}
            vote={v}
            now={now}
            onDelete={() => {
              deleteVote(v.id);
              toast({ title: "Vote deleted" });
            }}
          />
        ))}
      </ul>
      {ordered.length > shown ? (
        <Button size="sm" variant="ghost" className="mt-1 -ml-3" onClick={() => setShown((s) => s + PAGE * 2)}>
          Show {Math.min(PAGE * 2, ordered.length - shown)} more
        </Button>
      ) : null}
    </div>
  );
}
