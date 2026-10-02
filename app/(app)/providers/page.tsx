import { connection } from "next/server";
import { RouterRow } from "@/components/providers/router-row";
import { CopyButton } from "@/components/ui/copy-button";
import { PageHeader } from "@/components/ui/page-header";
import { buildEnvTemplate } from "@/lib/client/env-template";
import { providerStatuses } from "@/lib/providers/server";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Routers",
  description:
    "See which LLM routers are connected to TejRouter, test each one, and find the environment variables, base URL, default model and model list you need to add one.",
  path: "/providers",
});

export default async function ProvidersPage() {
  await connection();
  const providers = providerStatuses();
  const real = providers.filter((p) => !p.simulated).sort((a, b) => Number(b.configured) - Number(a.configured));
  const practice = providers.filter((p) => p.simulated);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Routers"
        description="See which routers are connected, test them, and add new ones. Keys stay on your machine."
        actions={
          <CopyButton
            text={buildEnvTemplate(providers)}
            label="Copy .env.local template"
            toastTitle=".env.local template copied"
            variant="secondary"
            size="sm"
          />
        }
      />

      <section aria-label="Routers">
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {real.map((p) => (
            <RouterRow key={p.id} provider={p} />
          ))}
        </ul>
      </section>

      {practice.length ? (
        <section aria-labelledby="practice-heading" className="mt-10">
          <h2 id="practice-heading" className="mb-3 text-[15px] font-semibold text-fg">
            Practice routers
          </h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {practice.map((p) => (
              <RouterRow key={p.id} provider={p} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
