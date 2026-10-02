"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IconHistory } from "@/components/ui/icons";
import { formatRelativeTime, truncate } from "@/lib/client/format";
import { readStorage, removeStorage, useStoredValue, writeStorage } from "@/lib/client/storage";
import { Popover } from "./popover";

export const HISTORY_KEY = "tejrouter.playground.history";
const MAX = 25;

export interface HistoryEntry {
  id: string;
  at: number;
  prompt: string;
  system: string;
}

const EMPTY: HistoryEntry[] = [];
function isHistory(v: unknown): v is HistoryEntry[] {
  return Array.isArray(v) && v.every((e) => e && typeof e.prompt === "string");
}

export function pushHistory(prompt: string, system: string) {
  const prev = readStorage<HistoryEntry[]>(HISTORY_KEY, EMPTY, isHistory);
  const next = [
    { id: `h-${Date.now().toString(36)}`, at: Date.now(), prompt, system },
    ...prev.filter((e) => !(e.prompt === prompt && e.system === system)),
  ].slice(0, MAX);
  writeStorage(HISTORY_KEY, next);
}

/** "Recent prompts" menu; picking one loads it into the composer. */
export function HistoryMenu({ onPick }: { onPick: (e: HistoryEntry) => void }) {
  const items = useStoredValue<HistoryEntry[]>(HISTORY_KEY, EMPTY, isHistory);
  const [now, setNow] = useState(0);

  return (
    <Popover
      label="Recent prompts"
      align="end"
      className="w-[min(400px,calc(100vw-2rem))]"
      trigger={({ toggle, open, props: aria }) => (
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<IconHistory size={15} />}
          {...aria}
          onClick={() => {
            if (!open) setNow(Date.now());
            toggle();
          }}
        >
          Recent prompts
        </Button>
      )}
    >
      {(close) =>
        items.length ? (
          <div>
            <ul className="max-h-80 overflow-y-auto py-1.5">
              {items.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(e);
                      close();
                    }}
                    className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
                  >
                    <span className="line-clamp-2 text-sm text-fg">{truncate(e.prompt, 160)}</span>
                    <span className="text-[13px] text-fg-muted">
                      {formatRelativeTime(e.at, now)}
                      {e.system ? " · with a system prompt" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="border-t border-border px-4 py-2">
              <button
                type="button"
                onClick={() => removeStorage(HISTORY_KEY)}
                className="text-[13px] text-fg-muted hover:text-danger"
              >
                Clear history
              </button>
            </div>
          </div>
        ) : (
          <p className="px-4 py-6 text-center text-sm text-fg-muted">Prompts you send will show up here.</p>
        )
      }
    </Popover>
  );
}
