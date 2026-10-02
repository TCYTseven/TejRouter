import { connection } from "next/server";
import { EnvSetup } from "@/components/providers/env-setup";
import { ProviderCard } from "@/components/providers/provider-card";
import { ButtonLink } from "@/components/ui/button";
import { IconServer, IconSparkles } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { providerStatuses } from "@/lib/providers/server";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Providers",
  description:
    "Configure and health-check every LLM router: which env var supplied the key, effective base URL, default model, discovered models, and a live ping with TTFT and routing headers.",
  path: "/providers",
});

export default async function ProvidersPage() {
  await connection();
  const providers = providerStatuses();
  const real = providers.filter((p) => !p.simulated);
  const sims = providers.filter((p) => p.simulated);
  const live = real.filter((p) => p.configured).length;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "TejRouter", href: "/" }, { label: "Providers" }]}
        icon={<IconServer size={16} />}
        title="Providers"
        description={`${live} of ${real.length} routers configured, plus ${sims.length} offline simulators. Keys never leave the server; you only ever see which env var supplied one and its last four characters.`}
        actions={
          <ButtonLink href="/onboarding" variant="secondary" leftIcon={<IconSparkles size={14} />}>
            Setup guide
          </ButtonLink>
        }
      />

      <section aria-labelledby="routers-heading">
        <h2 id="routers-heading" className="sr-only">
          Routers
        </h2>
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {[...real.sort((a, b) => Number(b.configured) - Number(a.configured)), ...sims].map((p) => (
            <ProviderCard key={p.id} provider={p} />
          ))}
        </div>
      </section>

      <section aria-labelledby="setup-heading" className="mt-10">
        <div className="mb-3">
          <h2 id="setup-heading" className="text-base font-semibold tracking-tight text-fg">
            Setup
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            Every environment variable each router reads. Copy the template into <code className="font-mono text-fg">.env.local</code> at the project root.
          </p>
        </div>
        <EnvSetup providers={providers} />
      </section>
    </>
  );
}
