"use client";

import { useRef } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { IconDownload, IconFile } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import type { ArenaVote } from "@/lib/client/arena-votes";
import { buildExport, downloadJson, importVotes } from "./vote-io";

export function ImportVotesButton({ variant = "secondary", size = "sm" }: { variant?: ButtonVariant; size?: ButtonSize }) {
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            const r = importVotes(await file.text());
            const extra = [r.duplicates ? `${r.duplicates} already present` : "", r.invalid ? `${r.invalid} invalid skipped` : ""]
              .filter(Boolean)
              .join(", ");
            toast({
              title: r.added ? `Imported ${r.added} vote${r.added === 1 ? "" : "s"}` : "No new votes imported",
              description: extra || undefined,
              tone: r.added ? "success" : "info",
            });
          } catch (err) {
            toast({ title: "Import failed", description: err instanceof Error ? err.message : String(err), tone: "error" });
          }
        }}
      />
      <Button variant={variant} size={size} leftIcon={<IconFile size={13} />} onClick={() => input.current?.click()}>
        Import JSON
      </Button>
    </>
  );
}

export function ExportVotesButton({ votes, size = "sm" }: { votes: ArenaVote[]; size?: ButtonSize }) {
  return (
    <Button
      size={size}
      leftIcon={<IconDownload size={13} />}
      disabled={!votes.length}
      onClick={() => downloadJson(`tejrouter-arena-votes-${new Date().toISOString().slice(0, 10)}.json`, buildExport(votes))}
    >
      Export JSON
    </Button>
  );
}
