import { connection } from "next/server";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { PageHeader } from "@/components/ui/page-header";
import { providerStatuses } from "@/lib/providers/server";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Connect a router",
  description:
    "Connect your LLM routers to TejRouter in three steps: pick the routers you use, add their keys to .env.local and restart, then test. No account needed.",
  path: "/onboarding",
});

export default async function OnboardingPage() {
  await connection();
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Connect a router"
        description="Three short steps. No account needed, and your keys never leave your machine."
      />
      <OnboardingFlow initial={providerStatuses()} />
    </div>
  );
}
