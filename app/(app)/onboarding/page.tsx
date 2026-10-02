import { connection } from "next/server";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { IconSparkles } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { providerStatuses } from "@/lib/providers/server";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Setup guide",
  description:
    "Connect your LLM routers to TejRouter in three steps: pick the routers you use, add their keys to .env.local, re-check, and race them. No account required.",
  path: "/onboarding",
});

export default async function OnboardingPage() {
  await connection();
  const providers = providerStatuses();
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "TejRouter", href: "/" }, { label: "Setup guide" }]}
        icon={<IconSparkles size={16} />}
        title="Setup guide"
        description="Three steps, no account. Everything stays on your machine."
      />
      <OnboardingFlow initial={providers} />
    </>
  );
}
