import Link from "next/link";
import { connection } from "next/server";
import { HeroVisual } from "@/components/landing/hero-visual";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingNav } from "@/components/landing/landing-nav";
import { LiveDemo } from "@/components/landing/live-demo";
import { ProviderStatusDot } from "@/components/providers/provider-status";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  IconArrowRight,
  IconCheckCircle,
  IconClock,
  IconGithub,
  IconRoute,
  IconSigma,
  IconSparkles,
  IconTerminal,
  IconTrophy,
} from "@/components/ui/icons";
import { ProviderDot } from "@/components/ui/provider";
import { providerStatuses } from "@/lib/providers/server";
import { pageMetadata, REPO_URL, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "TejRouter: the router that tests routers",
  description: SITE_DESCRIPTION,
  path: "/",
  absoluteTitle: true,
});

const STEPS = [
  {
    icon: IconRoute,
    title: "Route",
    body: "The same request goes to every router in parallel, through one OpenAI-compatible client. Auto models pick; pinned models don't.",
    tag: "parallel fan-out",
  },
  {
    icon: IconClock,
    title: "Measure",
    body: "Time to first token, total latency, tokens per second, reported or estimated cost, and the model each router actually served.",
    tag: "TTFT · p50 · $",
  },
  {
    icon: IconCheckCircle,
    title: "Grade",
    body: "Benchmark tasks are scored by deterministic graders: exact, numeric, regex, JSON, code tests and instruction constraints.",
    tag: "no LLM judge",
  },
  {
    icon: IconTrophy,
    title: "Compare",
    body: "Paired significance tests, confidence intervals, Pareto frontiers and an Elo leaderboard from your own blind votes.",
    tag: "statistics",
  },
];

const MATH = [
  {
    title: "Confidence intervals",
    formula: "p̂ ± z·√(p̂(1−p̂)/n)",
    body: "Wilson and bootstrap intervals on accuracy, latency and cost, so a 2-point gap is not mistaken for a win.",
  },
  {
    title: "McNemar & Wilcoxon",
    formula: "χ² = (b−c)² / (b+c)",
    body: "Paired tests on the same tasks: McNemar for right/wrong, Wilcoxon signed-rank for latency and cost.",
  },
  {
    title: "Bradley–Terry Elo",
    formula: "P(i ≻ j) = σ(rᵢ − rⱼ)",
    body: "Turns your arena votes into ratings with uncertainty, robust to unequal match counts.",
  },
  {
    title: "Pareto frontier & AIQ",
    formula: "max acc  s.t.  cost ≤ c",
    body: "Which routers are never dominated on quality versus cost, and the area under that frontier.",
  },
  {
    title: "Routing mutual information",
    formula: "I(model ; category)",
    body: "Does the router actually route by task, or send everything to one model? Measured in bits.",
  },
];

const QUICKSTART = `git clone ${REPO_URL}
cd tejrouter
npm install
cp .env.example .env.local   # add any router keys (optional)
npm run dev`;

export default async function LandingPage() {
  await connection();
  const providers = providerStatuses();
  const real = providers.filter((p) => !p.simulated);
  const live = real.filter((p) => p.configured).length;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    alternateName: "TejRouter: the router that tests routers",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any (Node.js 20.9+)",
    codeRepository: REPO_URL,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    featureList: [
      "Side-by-side LLM router playground with streaming",
      "Graded benchmark suites with repetitions",
      "Confidence intervals and paired significance tests",
      "Bradley-Terry arena leaderboard from blind votes",
      "Pareto frontier of quality versus cost",
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LandingNav />
      <main id="main" className="relative overflow-x-clip">
        {/* Hero */}
        <section aria-labelledby="hero-title" className="relative">
          <div aria-hidden="true" className="bg-grid bg-grid-fade pointer-events-none absolute inset-0" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
            style={{ background: "radial-gradient(closest-side, var(--accent-soft), transparent)" }}
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-24 lg:pb-24">
            <div className="flex animate-rise flex-col items-start gap-6">
              <Badge tone="accent" size="md" className="gap-1.5">
                <IconSparkles size={12} /> Self-hosted · runs locally · no account
              </Badge>
              <h1 id="hero-title" className="text-4xl leading-[1.04] font-semibold tracking-tight text-balance text-fg sm:text-5xl lg:text-6xl">
                TejRouter, the router that <span className="text-accent-text">tests routers</span>.
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-pretty text-fg-muted sm:text-lg">
                Send one prompt to Ramp Router, Enclave Cyberouter, OpenRouter, Requesty, FastLLM, Martian and your own gateway at once.
                See which model each one picked, how fast it answered, what it cost, and whether the difference is statistically real.
              </p>
              <div className="flex flex-wrap items-center gap-2.5">
                <ButtonLink href="/dashboard" variant="accent" size="lg" rightIcon={<IconArrowRight size={14} />}>
                  Open dashboard
                </ButtonLink>
                <ButtonLink href="/playground" variant="secondary" size="lg" leftIcon={<IconTerminal size={14} />}>
                  Try the playground
                </ButtonLink>
                <Link href="/onboarding" className="px-2 text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline">
                  Setup guide
                </Link>
              </div>
              <dl className="num mt-2 grid grid-cols-3 gap-6 border-t border-border pt-5 text-left">
                <div>
                  <dt className="text-[11px] text-fg-subtle">Routers</dt>
                  <dd className="text-xl text-fg">{real.length}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-fg-subtle">Offline simulators</dt>
                  <dd className="text-xl text-fg">{providers.length - real.length}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-fg-subtle">Accounts needed</dt>
                  <dd className="text-xl text-fg">0</dd>
                </div>
              </dl>
            </div>
            <HeroVisual className="animate-rise [animation-delay:120ms]" />
          </div>
        </section>

        {/* Live demo */}
        <section aria-labelledby="demo-title" className="border-t border-border bg-bg-subtle/50">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="eyebrow mb-2">Live, right now</p>
                <h2 id="demo-title" className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
                  Two routers, one prompt, real numbers.
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-fg-muted">
                  This runs through the same /api/chat pipeline as the playground, against the two built-in offline simulators. No keys involved.
                </p>
              </div>
              <ButtonLink href="/playground" variant="ghost" size="sm" rightIcon={<IconArrowRight size={13} />}>
                Full playground
              </ButtonLink>
            </div>
            <LiveDemo />
          </div>
        </section>

        {/* How it works */}
        <section aria-labelledby="how-title" className="border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <p className="eyebrow mb-2">How it works</p>
            <h2 id="how-title" className="max-w-2xl text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
              Route, measure, grade, compare.
            </h2>
            <ol className="relative mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div aria-hidden="true" className="absolute top-[22px] right-[12%] left-[12%] hidden h-px bg-gradient-to-r from-transparent via-border-strong to-transparent lg:block" />
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
                  <div className="flex items-center justify-between">
                    <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-border-strong bg-surface-2 text-accent-text">
                      <s.icon size={20} />
                    </span>
                    <span className="num text-xs text-fg-subtle">0{i + 1}</span>
                  </div>
                  <h3 className="text-base font-semibold text-fg">{s.title}</h3>
                  <p className="text-sm leading-relaxed text-fg-muted">{s.body}</p>
                  <span className="mt-auto font-mono text-[11px] text-fg-subtle">{s.tag}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Routers */}
        <section aria-labelledby="routers-title" className="border-t border-border bg-bg-subtle/50">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="eyebrow mb-2">Supported routers</p>
                <h2 id="routers-title" className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
                  Every router that speaks OpenAI, plus your own.
                </h2>
                <p className="mt-2 text-sm text-fg-muted">
                  <span className="num text-fg">{live}</span> of {real.length} configured on this machine. Adding a router is one registry entry.
                </p>
              </div>
              <ButtonLink href="/providers" variant="ghost" size="sm" rightIcon={<IconArrowRight size={13} />}>
                Provider details
              </ButtonLink>
            </div>
            <ul className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3 sm:[&>li:last-child:nth-child(odd)]:col-span-2 lg:[&>li:last-child:nth-child(odd)]:col-span-1">
              {providers.map((p) => (
                <li key={p.id} className="flex items-start gap-3 bg-surface p-4">
                  <span className="mt-1.5">
                    <ProviderDot provider={p} size={10} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-sm font-medium text-fg">{p.name}</h3>
                      <span className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
                        <ProviderStatusDot provider={p} />
                        {p.simulated ? "simulator" : p.configured ? "configured" : "add key"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-fg-muted">{p.tagline}</p>
                    {p.autoModel ? <p className="mt-1.5 font-mono text-[11px] text-fg-subtle">{p.autoModel}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* The math */}
        <section aria-labelledby="math-title" className="border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="flex flex-col items-start gap-4">
                <p className="eyebrow">The math</p>
                <h2 id="math-title" className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
                  Leaderboards lie. Intervals don&apos;t.
                </h2>
                <p className="text-sm leading-relaxed text-fg-muted">
                  A single run on a single prompt tells you almost nothing. TejRouter repeats, pairs and bootstraps so you can say which router is better, by how much, and how sure you are.
                </p>
                <ButtonLink href="/methodology" variant="secondary" leftIcon={<IconSigma size={14} />}>
                  Read the methodology
                </ButtonLink>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {MATH.map((m, i) => (
                  <li
                    key={m.title}
                    className={`flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 ${i === MATH.length - 1 ? "sm:col-span-2" : ""}`}
                  >
                    <h3 className="text-sm font-semibold text-fg">{m.title}</h3>
                    <code className="block overflow-x-auto rounded-md border border-border bg-bg-subtle px-2.5 py-1.5 font-mono text-xs whitespace-nowrap text-accent-text">
                      {m.formula}
                    </code>
                    <p className="text-xs leading-relaxed text-fg-muted">{m.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Quickstart */}
        <section aria-labelledby="quickstart-title" className="border-t border-border bg-bg-subtle/50">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-20">
            <div className="flex flex-col items-start gap-4">
              <p className="eyebrow">Quickstart</p>
              <h2 id="quickstart-title" className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
                Running in under a minute.
              </h2>
              <p className="text-sm leading-relaxed text-fg-muted">
                Clone, install, start. The simulators work immediately; drop router keys into <code className="font-mono text-fg">.env.local</code> whenever you&apos;re ready and the dashboard lights up.
              </p>
              <div className="flex flex-wrap gap-2">
                <ButtonLink href="/onboarding" variant="accent" rightIcon={<IconArrowRight size={14} />}>
                  Setup guide
                </ButtonLink>
                <ButtonLink href={REPO_URL} external variant="secondary" leftIcon={<IconGithub size={14} />}>
                  View source
                </ButtonLink>
              </div>
            </div>
            <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
              <div className="flex h-10 items-center justify-between border-b border-border px-4">
                <span className="font-mono text-[11px] text-fg-subtle">terminal</span>
                <CopyButton text={QUICKSTART} label="Copy" toastTitle="Commands copied" size="xs" variant="secondary" />
              </div>
              <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-7 text-fg">
                {QUICKSTART.split("\n").map((line) => {
                  const [cmd, comment] = line.split("   #");
                  return (
                    <div key={line}>
                      <span className="text-accent-text select-none">$ </span>
                      {cmd}
                      {comment ? <span className="text-fg-subtle">   #{comment}</span> : null}
                    </div>
                  );
                })}
              </pre>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </>
  );
}
