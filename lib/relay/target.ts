import { isIP } from "node:net";

/**
 * Rules for the URLs /api/relay may forward to. The relay exists only so a router that
 * refuses requests from web pages (CORS) can still be called with a key saved in
 * Settings, so it forwards nothing but OpenAI-compatible chat (Chat Completions or Responses) and model-list calls,
 * and, in production, only to public HTTPS hosts.
 */

const ALLOWED_PATH = /\/(chat\/completions|responses|models)$/;

export type TargetCheck = { ok: true; url: URL } | { ok: false; error: string };

export function checkTargetUrl(raw: string | null, allowPrivate: boolean): TargetCheck {
  if (!raw) return { ok: false, error: "missing target URL" };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "target is not a valid URL" };
  }
  if (url.protocol !== "https:" && !(allowPrivate && url.protocol === "http:")) {
    return { ok: false, error: "the router's base URL must use https" };
  }
  if (url.username || url.password) return { ok: false, error: "credentials in the URL are not allowed" };
  if (!ALLOWED_PATH.test(url.pathname)) return { ok: false, error: "only /chat/completions, /responses and /models are relayed" };
  if (!allowPrivate) {
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (/^localhost$|\.localhost$|\.local$|\.internal$/i.test(host)) return { ok: false, error: "private hosts are not relayed" };
    if (isIP(host) && isPrivateAddress(host)) return { ok: false, error: "private hosts are not relayed" };
  }
  return { ok: true, url };
}

/** Loopback, private, link-local, carrier-NAT, multicast and reserved ranges. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return s === "::" || s === "::1" || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || s.startsWith("ff");
  }
  return true;
}
