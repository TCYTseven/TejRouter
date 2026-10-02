"use client";

import { useSyncExternalStore } from "react";

/* A shared, coarse clock so relative timestamps ("3m ago") stay fresh without
   every row owning a timer, and render stays pure. */
let now = 0;
const subs = new Set<() => void>();
let timer: number | undefined;

function subscribe(cb: () => void) {
  subs.add(cb);
  if (subs.size === 1) {
    timer = window.setInterval(() => {
      now = Date.now();
      subs.forEach((fn) => fn());
    }, 30_000);
  }
  return () => {
    subs.delete(cb);
    if (!subs.size && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}

function snapshot() {
  if (!now) now = Date.now();
  return now;
}

/** Current time (ms), refreshed every 30 s. 0 during server render. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}
