import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Optional password gate. TejRouter's API routes spend credits on your router
 * keys, so when the app is reachable by anyone else (a deployment, a shared
 * network), set TEJROUTER_PASSWORD and every page and API call requires HTTP
 * Basic auth. Unset (the default for local use), this is a no-op.
 */
export function proxy(request: NextRequest) {
  const password = process.env.TEJROUTER_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    let decoded = "";
    try {
      decoded = atob(header.slice(6));
    } catch {
      decoded = "";
    }
    const supplied = decoded.slice(decoded.indexOf(":") + 1);
    if (safeEqual(supplied, password)) return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="TejRouter", charset="UTF-8"' },
  });
}

function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon|robots.txt|sitemap.xml|manifest.webmanifest|opengraph-image).*)"],
};
