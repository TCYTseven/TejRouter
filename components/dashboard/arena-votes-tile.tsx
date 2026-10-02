"use client";

import { StatTile } from "@/components/ui/stat";
import { IconTrophy } from "@/components/ui/icons";
import { useArenaVotes } from "@/lib/client/arena-votes";
import { useHydrated } from "@/lib/client/onboarding";
import { formatRelativeTime } from "@/lib/client/format";

export function ArenaVotesTile() {
  const votes = useArenaVotes();
  const hydrated = useHydrated();
  const last = votes.length ? votes[votes.length - 1].at : null;
  return (
    <StatTile
      label="Arena votes"
      icon={<IconTrophy size={12} />}
      value={hydrated ? votes.length : "—"}
      sub={hydrated ? (last ? `last ${formatRelativeTime(last)}` : "vote after a playground round") : "stored in this browser"}
    />
  );
}
