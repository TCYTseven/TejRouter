import { connection } from "next/server";
import Link from "next/link";
import { ArenaVotesTile } from "@/components/dashboard/arena-votes-tile";
import { LatestBenchmark } from "@/components/dashboard/latest-benchmark";
import { ProviderStatusGrid } from "@/components/providers/provider-status-grid";
import { OnboardingBanner } from "@/components/shell/onboarding-banner";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  IconArrowRight,
  IconCpu,
  IconFlask,
  IconLayout,
  IconServer,
  IconTerminal,
  IconTrophy,
} from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat";
import { buildEnvTemplate } from "@/lib/client/env-template";
import { providerStatuses } from "@/lib/providers/server";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Dashboard",
  description:
    "Status of every LLM router TejRouter can test: which keys are configured, base URLs, default models, and your latest benchmark run.",
  path: "/dashboard",
});

const ACTIONS = [
  {
    href: "/playground",
    title: "Open the playground",
    body: "Race one prompt across every router and watch TTFT, latency, cost and the routing decision stream in.",
    icon: IconTerminal,
    cta: "Start a round",
  },
  {
    href: "/benchmarks",
    title: "Run a benchmark",
    body: "Graded suites with repetitions, confidence intervals and paired significance tests.",
    icon: IconFlask,
    cta: "Choose suites",
  },
  {
    href: "/arena",
    title: "Arena leaderboard",
    body: "Blind-vote on playground rounds and rank routers with Bradley-Terry ratings.",
    icon: IconTrophy,
    cta: "See rankings",
  },
];

export default async function DashboardPage() {
  await connection();
  const providers = providerStatuses();
  const real = providers.filter((p) => !p.simulated);
  const live = real.filter((p) => p.configured);
  const sims = providers.filter((p) => p.simulated);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "TejRouter", href: "/" }, { label: "Dashboard" }]}
        icon={<IconLayout size={16} />}
        title="Dashboard"
        description="TejRouter sends the same prompt to every LLM router you use and measures what comes back: the model it routed to, how fast it answered, what it cost, and whether it was right."
        actions={
          <>
            <ButtonLink href="/providers" variant="secondary" size="md" leftIcon={<IconServer size={14} />}>
              Providers
            </ButtonLink>
            <ButtonLink href="/playground" variant="accent" size="md" leftIcon={<IconTerminal size={14} />}>
              Playground
            </ButtonLink>
          </>
        }
      />

      <OnboardingBanner realConfigured={live.length} envTemplate={buildEnvTemplate(providers)} />

      <section aria-label="At a glance" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Routers configured"
          icon={<IconServer size={12} />}
          value={
            <>
              {live.length}
              <span className="text-fg-subtle">/{real.length}</span>
            </>
          }
          sub={live.length ? live.map((p) => p.name).join(", ") : "add keys in .env.local"}
          emphasis={live.length > 0}
        />
        <StatTile label="Offline simulators" icon={<IconCpu size={12} />} value={sims.length} sub="always available, no keys" />
        <ArenaVotesTile />
        <StatTile
          label="Ready to race"
          icon={<IconTerminal size={12} />}
          value={live.length + sims.length}
          sub="arms the playground can run"
        />
      </section>

      <section aria-labelledby="quick-actions" className="mt-6">
        <h2 id="quick-actions" className="eyebrow mb-2.5">
          Quick actions
        </h2>
        <ul className="grid gap-3 md:grid-cols-3">
          {ACTIONS.map((a) => (
            <li key={a.href}>
              <Link
                href={a.href}
                className="group relative flex h-full flex-col gap-2 overflow-hidden rounded-lg border border-border bg-surface p-4 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-border-strong"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-line to-transparent opacity-0 transition-opacity group-hover:opacity-100"
                />
                <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface-2 text-accent-text">
                  <a.icon size={16} />
                </span>
                <span className="text-sm font-semibold text-fg">{a.title}</span>
                <span className="text-xs leading-relaxed text-fg-muted">{a.body}</span>
                <span className="mt-auto flex items-center gap-1 pt-1 text-xs font-medium text-accent-text">
                  {a.cta}
                  <IconArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card as="section" aria-labelledby="router-status-title" className="xl:col-span-2">
          <CardHeader
            title={<span id="router-status-title">Router status</span>}
            icon={<IconServer size={14} />}
            description="Keys are read server-side; only the last four characters are shown."
            actions={
              <Link href="/providers" className="text-[11px] text-fg-subtle hover:text-fg">
                Manage
              </Link>
            }
          />
          <div className="p-3">
            <ProviderStatusGrid providers={providers} />
          </div>
        </Card>
        <LatestBenchmark />
      </div>
    </>
  );
}
