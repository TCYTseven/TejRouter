"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { IconHistory, IconTrash } from "@/components/ui/icons";
import { formatRelativeTime, truncate } from "@/lib/client/format";
import { removeStorage, useStoredValue, writeStorage, readStorage } from "@/lib/client/storage";

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

/** Popover with recent prompts; selecting one loads it into the composer. */
export function HistoryMenu({ onPick }: { onPick: (e: HistoryEntry) => void }) {
  const items = useStoredValue<HistoryEntry[]>(HISTORY_KEY, EMPTY, isHistory);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button
        size="md"
        variant="secondary"
        leftIcon={<IconHistory size={14} />}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setNow(Date.now());
          setOpen((o) => !o);
        }}
      >
        History
        {items.length ? <span className="num rounded bg-surface-3 px-1 text-[10px] text-fg-muted">{items.length}</span> : null}
      </Button>
      {open ? (
        <div
          id={id}
          role="dialog"
          aria-label="Recent prompts"
          className="absolute right-0 z-40 mt-1 w-[min(380px,calc(100vw-2rem))] animate-rise overflow-hidden rounded-lg border border-border-strong bg-surface shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-medium text-fg">Recent prompts</span>
            {items.length ? (
              <button
                type="button"
                onClick={() => removeStorage(HISTORY_KEY)}
                className="flex items-center gap-1 text-[11px] text-fg-subtle hover:text-danger"
              >
                <IconTrash size={12} /> Clear
              </button>
            ) : null}
          </div>
          {items.length ? (
            <ul className="max-h-80 overflow-y-auto py-1">
              {items.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(e);
                      setOpen(false);
                    }}
                    className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
                  >
                    <span className="line-clamp-2 text-xs text-fg">{truncate(e.prompt, 160)}</span>
                    <span className="num text-[10px] text-fg-subtle">
                      {formatRelativeTime(e.at, now)}
                      {e.system ? " · with system prompt" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-6 text-center text-xs text-fg-subtle">Prompts you run will show up here.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
