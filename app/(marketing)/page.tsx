import Link from "next/link";
import { connection } from "next/server";
import { ComparisonCard } from "@/components/landing/comparison-card";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingNav } from "@/components/landing/landing-nav";
import { Reveal } from "@/components/landing/reveal";
import { ButtonLink } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { ProviderDot } from "@/components/ui/provider";
import { providerStatuses } from "@/lib/providers/server";
import { pageMetadata, REPO_URL, SITE_NAME, SITE_URL } from "@/lib/seo";
import type { ProviderStatus } from "@/lib/types";

const TITLE = "TejRouter: find out which LLM router is actually better";
const DESCRIPTION =
  "Send the same prompts to Ramp Router, Enclave Cyberouter, OpenRouter, Requesty, FastLLM, Martian or any OpenAI-compatible endpoint, and see which model each one picked, how fast it answered, what it cost and whether it was right. Runs locally, no account.";

export const metadata = pageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: "/",
  absoluteTitle: true,
});

const STEPS = [
  { title: "Connect your routers", body: "Add API keys to .env.local, or start with the two practice routers that need no keys." },
  { title: "Send the same prompts", body: "Every router gets the same prompt at the same time, either one at a time or as a graded benchmark." },
  { title: "See which wins and why", body: "Compare the model each router picked, its speed, its cost and how often it got the answer right." },
];

const QUICKSTART = [
  { cmd: `git clone ${REPO_URL} && cd tejrouter` },
  { cmd: "npm install" },
  { cmd: "cp .env.example .env.local", note: "# optional: add router keys" },
  { cmd: "npm run dev" },
];
const QUICKSTART_TEXT = QUICKSTART.map((l) => l.cmd).join("\n");

function statusLabel(p: ProviderStatus) {
  if (p.simulated) return "Practice router, no key needed";
  return p.configured ? "Connected" : "Needs a key";
}

export default async function LandingPage() {
  await connection();
  const providers = providerStatuses();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    alternateName: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any (Node.js 20.9+)",
    codeRepository: REPO_URL,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    featureList: [
      "Send one prompt to several LLM routers side by side",
      "See the model each router picked, its speed and its cost",
      "Graded benchmarks that measure accuracy",
      "Confidence ranges and significance tests on every result",
      "Blind voting leaderboard",
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <noscript>
        <style>{"[data-reveal]{opacity:1!important;transform:none!important}"}</style>
      </noscript>
      <LandingNav />
      <main id="main" className="mx-auto max-w-5xl px-4 sm:px-6">
        {/* Hero */}
        <section aria-labelledby="hero-title" className="pt-12 pb-12 sm:pt-24 sm:pb-16">
          <div className="max-w-2xl">
            <Reveal as="h1" onLoad className="text-4xl leading-[1.1] font-semibold tracking-tight text-balance text-fg sm:text-5xl">
              <span id="hero-title">Find out which LLM router is actually better.</span>
            </Reveal>
            <Reveal as="p" onLoad delay={0.1} className="mt-5 text-lg leading-relaxed text-pretty text-fg-muted">
              TejRouter sends the same prompts to each router and shows you the model it picked, how fast it answered, what it cost and
              whether it got the answer right.
            </Reveal>
            <Reveal onLoad delay={0.2} className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/playground" variant="primary" size="lg">
                Compare routers
              </ButtonLink>
              <ButtonLink href="/benchmarks" variant="secondary" size="lg">
                Run a benchmark
              </ButtonLink>
            </Reveal>
          </div>
          <Reveal onLoad delay={0.3} className="mt-14">
            <ComparisonCard />
          </Reveal>
        </section>

        {/* How it works */}
        <section aria-labelledby="how-title" className="border-t border-border py-12 sm:py-16">
          <h2 id="how-title" className="text-2xl font-semibold tracking-tight text-fg">
            How it works
          </h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s.title} delay={i * 0.1}>
                <h3 className="text-[15px] font-semibold text-fg">
                  <span className="num mr-2 text-fg-muted">{i + 1}.</span>
                  {s.title}
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{s.body}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* Rigor */}
        <section aria-labelledby="rigor-title" className="border-t border-border py-12 sm:py-16">
          <Reveal className="max-w-2xl">
            <h2 id="rigor-title" className="text-2xl font-semibold tracking-tight text-fg">
              Know when a difference is real
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
              Every result comes with a confidence range and a significance test, so a lucky run is never mistaken for a better
              router.{" "}
              <Link href="/methodology" className="link">
                Read the methodology
              </Link>
            </p>
          </Reveal>
        </section>

        {/* Routers */}
        <section aria-labelledby="routers-title" className="border-t border-border py-12 sm:py-16">
          <h2 id="routers-title" className="text-2xl font-semibold tracking-tight text-fg">
            Supported routers
          </h2>
          <p className="mt-3 text-[15px] text-fg-muted">
            Any OpenAI-compatible endpoint works. Status below is for this machine.
          </p>
          <ul className="mt-8 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            {providers.map((p, i) => (
              <Reveal as="li" key={p.id} delay={(i % 3) * 0.06 + Math.floor(i / 3) * 0.04} className="flex items-center gap-3 border-b border-border py-3">
                <ProviderDot provider={p} size={10} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-fg">{p.name}</span>
                  <span className="block text-[13px] text-fg-muted">{statusLabel(p)}</span>
                </span>
              </Reveal>
            ))}
          </ul>
        </section>

        {/* Quickstart */}
        <section aria-labelledby="quickstart-title" className="border-t border-border py-12 sm:py-16">
          <h2 id="quickstart-title" className="text-2xl font-semibold tracking-tight text-fg">
            Run it locally
          </h2>
          <p className="mt-3 text-[15px] text-fg-muted">
            No account. Keys stay on your machine. Open <span className="text-fg">localhost:3000</span> when it starts.
          </p>
          <Reveal className="relative mt-6 rounded-xl border border-border bg-surface">
            <CopyButton text={QUICKSTART_TEXT} label="Copy commands" toastTitle="Commands copied" iconOnly className="absolute top-3 right-3 bg-surface" />
            <pre className="overflow-x-auto py-4 pr-14 pl-5 font-mono text-[13px] leading-7 text-fg">
              <code>
                {QUICKSTART.map((l) => (
                  <span key={l.cmd} className="block">
                    {l.cmd}
                    {l.note ? <span className="text-fg-muted">{"   " + l.note}</span> : null}
                  </span>
                ))}
              </code>
            </pre>
          </Reveal>
        </section>
      </main>
      <LandingFooter />
    </>
  );
}
