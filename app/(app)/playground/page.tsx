import { connection } from "next/server";
import { Playground } from "@/components/playground/playground";
import { buildEnvTemplate } from "@/lib/client/env-template";
import { providerStatuses } from "@/lib/providers/server";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Playground",
  description:
    "Race one prompt across multiple LLM routers in parallel. Watch responses stream side by side with TTFT, latency, tokens per second, cost and the model each router chose, then blind-vote the best answer.",
  path: "/playground",
});

export default async function PlaygroundPage() {
  await connection();
  const providers = providerStatuses();
  return <Playground providers={providers} envTemplate={buildEnvTemplate(providers)} />;
}
