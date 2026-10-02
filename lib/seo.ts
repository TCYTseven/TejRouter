import type { Metadata } from "next";

/**
 * Site-wide SEO constants and the per-page metadata pattern.
 *
 *   export const metadata = pageMetadata({
 *     title: "Benchmarks",
 *     description: "…",
 *     path: "/benchmarks",
 *   });
 *
 * Title becomes "Benchmarks · TejRouter" through the root template; canonical,
 * Open Graph and Twitter fields are filled in consistently. The OG image comes
 * from app/opengraph-image.tsx automatically.
 */

export const SITE_NAME = "TejRouter";
export const SITE_TAGLINE = "the router that tests routers";
export const SITE_DESCRIPTION =
  "TejRouter benchmarks LLM routers (Ramp Router, Enclave Cyberouter, OpenRouter, Requesty, FastLLM, Martian and your own) side by side: live playground races, graded benchmark suites, and rigorous statistics on quality, latency, cost and routing decisions.";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
export const REPO_URL = "https://github.com/TCYTseven/tejrouter";

export const SITE_KEYWORDS = [
  "LLM router",
  "LLM router benchmark",
  "model routing",
  "OpenRouter",
  "Requesty",
  "Martian",
  "Ramp Router",
  "Enclave Cyberouter",
  "FastLLM",
  "AI gateway",
  "LLM evaluation",
  "latency benchmark",
  "TTFT",
  "Bradley-Terry",
  "Elo",
  "Pareto frontier",
];

/** The generated 1200x630 card from app/opengraph-image.tsx. */
export const OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "TejRouter: the router that tests routers",
};

export function pageMetadata({
  title,
  description,
  path,
  absoluteTitle,
}: {
  title: string;
  description: string;
  /** Route path, e.g. "/playground". Used for canonical and og:url. */
  path: string;
  /** Skip the "%s · TejRouter" template (landing page). */
  absoluteTitle?: boolean;
}): Metadata {
  const full = absoluteTitle ? title : `${title} · ${SITE_NAME}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_US",
      url: path,
      title: full,
      description,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: full,
      description,
      images: [OG_IMAGE.url],
    },
  };
}
