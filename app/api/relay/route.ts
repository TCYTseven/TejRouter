import { lookup } from "node:dns/promises";
import { checkTargetUrl, isPrivateAddress } from "@/lib/relay/target";

export const maxDuration = 300;

/**
 * Forwards one request from the browser to a router that refuses requests from web pages
 * (CORS). Used only for keys saved in Settings, and only after the direct call failed.
 * The key arrives in a request header, is passed on to the router, and is never logged,
 * stored or echoed back.
 *
 * Request: the router URL in `x-relay-url`; each header for the router as `x-relay-<name>`.
 */

const RELAY_HEADER = "x-relay-";
const MAX_BODY = 4 * 1024 * 1024;
const DROP_RESPONSE_HEADER = /^(set-cookie|content-encoding|content-length|transfer-encoding|connection|keep-alive)$/i;

function fail(status: number, error: string) {
  return Response.json({ error: `TejRouter relay: ${error}` }, { status, headers: { "Cache-Control": "no-store" } });
}

function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

async function relay(request: Request): Promise<Response> {
  // Only this app's own pages may use the relay.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return fail(403, "cross-site requests are not relayed");
  const origin = request.headers.get("origin");
  if (origin && hostOf(origin) !== request.headers.get("host")) return fail(403, "cross-site requests are not relayed");

  const allowPrivate = process.env.NODE_ENV !== "production";
  const check = checkTargetUrl(request.headers.get("x-relay-url"), allowPrivate);
  if (!check.ok) return fail(400, check.error);
  const target = check.url;

  if (!allowPrivate) {
    try {
      const addrs = await lookup(target.hostname.replace(/^\[|\]$/g, ""), { all: true });
      if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) return fail(400, "private hosts are not relayed");
    } catch {
      return fail(502, `could not resolve ${target.hostname}`);
    }
  }

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k.startsWith(RELAY_HEADER) && k !== "x-relay-url") headers.set(k.slice(RELAY_HEADER.length), value);
  });

  let body: ArrayBuffer | undefined;
  if (request.method === "POST") {
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY) return fail(413, "request body too large");
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
      signal: request.signal,
      cache: "no-store",
    });
  } catch (e) {
    if (request.signal.aborted) return fail(499, "aborted");
    const msg = e instanceof Error ? (e.cause instanceof Error ? e.cause.message : e.message) : String(e);
    return fail(502, `could not reach ${target.host} (${msg})`);
  }
  if (upstream.status >= 300 && upstream.status < 400) {
    await upstream.body?.cancel();
    return fail(502, `${target.host} answered with a redirect; check the base URL`);
  }

  const out = new Headers({ "Cache-Control": "no-store" });
  upstream.headers.forEach((value, key) => {
    if (!DROP_RESPONSE_HEADER.test(key)) out.set(key, value);
  });
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}

export const GET = relay;
export const POST = relay;
