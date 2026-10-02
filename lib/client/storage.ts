import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * localStorage wrapper that never throws (private mode, quota, SSR, disabled
 * storage) plus a same-tab change bus so hooks re-render when any component
 * writes a key.
 */

const listeners = new Map<string, Set<() => void>>();
let windowListenerInstalled = false;

function notify(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

function installWindowListener() {
  if (windowListenerInstalled || typeof window === "undefined") return;
  windowListenerInstalled = true;
  window.addEventListener("storage", (e) => {
    if (e.key) notify(e.key);
    else listeners.forEach((_, k) => notify(k));
  });
}

export function readRaw(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Read and JSON-parse a key. Returns `fallback` when missing, unparsable or invalid. */
export function readStorage<T>(key: string, fallback: T, validate?: (v: unknown) => v is T): T {
  const raw = readRaw(key);
  if (raw == null) return fallback;
  try {
    const v = JSON.parse(raw) as unknown;
    if (validate && !validate(v)) return fallback;
    return v as T;
  } catch {
    return fallback;
  }
}

/** JSON-serialize and store a value. Returns false if storage is unavailable. */
export function writeStorage<T>(key: string, value: T): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    notify(key);
    return true;
  } catch {
    return false;
  }
}

export function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  notify(key);
}

/** Subscribe to changes of one key (this tab and other tabs). */
export function subscribeStorage(key: string, cb: () => void): () => void {
  installWindowListener();
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  set.add(cb);
  return () => {
    set!.delete(cb);
  };
}

/**
 * Reactive read of a JSON value in localStorage. Server render and the first
 * client render both use `fallback`, so there is no hydration mismatch.
 * `fallback` should be referentially stable (a module constant).
 */
export function useStoredValue<T>(key: string, fallback: T, validate?: (v: unknown) => v is T): T {
  const subscribe = useCallback((cb: () => void) => subscribeStorage(key, cb), [key]);
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => null,
  );
  return useMemo(() => {
    if (raw == null) return fallback;
    try {
      const v = JSON.parse(raw) as unknown;
      if (validate && !validate(v)) return fallback;
      return v as T;
    } catch {
      return fallback;
    }
  }, [raw, fallback, validate]);
}

/** useState-like hook persisted to localStorage. */
export function useStoredState<T>(
  key: string,
  fallback: T,
  validate?: (v: unknown) => v is T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const value = useStoredValue(key, fallback, validate);
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = readStorage(key, fallback, validate);
      const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      writeStorage(key, v);
    },
    [key, fallback, validate],
  );
  return [value, set];
}
