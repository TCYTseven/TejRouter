"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { IconEqual, IconHistory, IconThumbDown, IconTrash, IconTrophy } from "@/components/ui/icons";
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

function Outcome({ vote }: { vote: ArenaVote }) {
  if (vote.winner === "tie")
    return (
      <Badge tone="neutral">
        <IconEqual size={11} /> Tie
      </Badge>
    );
  if (vote.winner === "all-bad")
    return (
      <Badge tone="warning">
        <IconThumbDown size={11} /> All bad
      </Badge>
    );
  if (!vote.armIds.includes(vote.winner))
    return (
      <Badge tone="danger" title="The winner is not one of the arms; this vote is skipped.">
        Invalid
      </Badge>
    );
  return null;
}

function VoteRow({ vote, now, onDelete }: { vote: ArenaVote; now: number; onDelete: () => void }) {
  const decisive = vote.winner !== "tie" && vote.winner !== "all-bad";
  return (
    <li className="group flex gap-3 px-4 py-3 hover:bg-surface-2/50">
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[13px] leading-snug text-fg" title={vote.prompt}>
          {vote.prompt.trim() ? truncate(vote.prompt.trim(), 220) : <span className="text-fg-subtle italic">(empty prompt)</span>}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {vote.armIds.map((id) => {
            const a = armInfo(id);
            const won = decisive && id === vote.winner;
            return (
              <span
                key={id}
                title={armLabel(id)}
                className={cn(
                  "inline-flex h-6 max-w-[220px] items-center gap-1.5 rounded-md border px-2 text-[11px]",
                  won ? "border-accent-line bg-accent-soft font-medium text-fg" : "border-border bg-surface-2 text-fg-muted",
                )}
              >
                {won ? <IconTrophy size={11} className="shrink-0 text-accent-text" title="Winner" /> : null}
                <ProviderDot color={a.color} simulated={a.simulated} size={7} />
                <span className="truncate">{a.name}</span>
                {a.model ? <span className="hidden truncate font-mono text-[10px] text-fg-subtle sm:inline">{a.model}</span> : null}
              </span>
            );
          })}
          <Outcome vote={vote} />
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        <time className="text-[11px] whitespace-nowrap text-fg-subtle" dateTime={isoOrUndefined(vote.at)} title={formatDateTime(vote.at)}>
          {now ? formatRelativeTime(vote.at, now) : formatDateTime(vote.at)}
        </time>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete vote on “${truncate(vote.prompt, 40)}”`}
          title="Delete vote"
          onClick={onDelete}
          className="text-fg-subtle hover:text-danger sm:opacity-60 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        >
          <IconTrash size={14} />
        </Button>
      </div>
    </li>
  );
}

/** Newest-first list of votes with delete, clear-all (confirmed) and JSON export/import. */
export function VoteHistory({ votes }: { votes: ArenaVote[] }) {
  const now = useNow();
  const toast = useToast();
  const [shown, setShown] = useState(PAGE);
  const [confirming, setConfirming] = useState(false);
  const ordered = [...votes].sort((a, b) => b.at - a.at);
  const visible = ordered.slice(0, shown);

  return (
    <Card as="section" aria-labelledby="vote-history-title">
      <CardHeader
        icon={<IconHistory size={14} />}
        title={<span id="vote-history-title">Vote history</span>}
        description={`${votes.length} vote${votes.length === 1 ? "" : "s"} stored in this browser. Deleting a vote recomputes the leaderboard.`}
        className="flex-wrap"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <ExportVotesButton votes={votes} />
            <ImportVotesButton />
            {confirming ? (
              <span className="flex items-center gap-1.5" role="group" aria-label="Confirm clearing all votes">
                <Button
                  size="sm"
                  variant="danger"
                  autoFocus
                  onClick={() => {
                    clearVotes();
                    setConfirming(false);
                    toast({ title: "All votes cleared" });
                  }}
                >
                  Delete {votes.length}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" leftIcon={<IconTrash size={13} />} onClick={() => setConfirming(true)} disabled={!votes.length}>
                Clear all
              </Button>
            )}
          </div>
        }
      />
      {confirming ? (
        <p role="alert" className="border-b border-border bg-danger-soft px-4 py-2 text-xs text-danger">
          Delete all {votes.length} votes from this browser? This cannot be undone. Export first if you want a backup.
        </p>
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
        <div className="border-t border-border px-4 py-2.5">
          <Button size="sm" variant="ghost" onClick={() => setShown((s) => s + PAGE * 2)}>
            Show {Math.min(PAGE * 2, ordered.length - shown)} more
            <span className="text-fg-subtle">({ordered.length - shown} hidden)</span>
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
