/**
 * Calls to a router with a key saved in Settings go straight from the browser when the
 * router allows requests from web pages (CORS). When it does not, the browser reports a
 * bare network error; the call is then retried through /api/relay, which forwards it and
 * keeps nothing, and later calls to that router go through the relay from the start.
 */

const RELAY_KEY = "tejrouter:relay-origins:v1";
const relayed = new Set<string>(readRelayed());

function readRelayed(): string[] {
  try {
    const raw = typeof window !== "undefined" ? window.sessionStorage?.getItem(RELAY_KEY) : null;
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function remember(origin: string) {
  relayed.add(origin);
  try {
    window.sessionStorage?.setItem(RELAY_KEY, JSON.stringify([...relayed]));
  } catch {
    /* storage unavailable: the in-memory set still works for this page */
  }
}

function isAbort(e: unknown, signal: AbortSignal | null | undefined): boolean {
  return Boolean(signal?.aborted) || (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError"));
}

/** Send one request through TejRouter's relay. */
export function viaRelay(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers({ "x-relay-url": url });
  new Headers(init.headers).forEach((value, key) => headers.set(`x-relay-${key}`, value));
  return fetch("/api/relay", {
    method: init.method ?? "GET",
    headers,
    body: init.body,
    signal: init.signal,
    cache: "no-store",
    credentials: "same-origin",
  });
}

/** fetch() for router calls: direct first, the relay when the browser is blocked. */
export const routerFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return fetch(input, init);
  }
  if (relayed.has(origin)) return viaRelay(url, init);
  try {
    return await fetch(input, init);
  } catch (e) {
    if (isAbort(e, init?.signal) || !(e instanceof TypeError)) throw e;
    // A CORS refusal fails at the preflight, before the router sees the request.
    remember(origin);
    return viaRelay(url, init);
  }
};
