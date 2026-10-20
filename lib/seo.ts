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
export const SITE_TAGLINE = "find out which LLM router is actually better";
export const SITE_DESCRIPTION =
  "TejRouter sends the same prompts to LLM routers like Ramp Router, Enclave Cyberouter, OpenRouter and Requesty, and shows which model each picked, how fast it answered, what it cost and whether it got the answer right.";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
export const REPO_URL = "https://github.com/TCYTseven/TejRouter";

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
];

/** The generated 1200x630 card from app/opengraph-image.tsx. */
export const OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "TejRouter: find out which LLM router is actually better",
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
