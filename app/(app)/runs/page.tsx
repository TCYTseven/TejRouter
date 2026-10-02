import { connection } from "next/server";
import { RunsList } from "@/components/bench/runs-list";
import { listRuns } from "@/lib/bench/store";
import { PROVIDERS } from "@/lib/providers/registry";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Runs",
  description:
    "Saved LLM router benchmark runs: accuracy, mean latency and total cost per arm at a glance, with import, export and full per-run reports.",
  path: "/runs",
});

/** Request time, so relative dates render identically on server and client. */
function requestTime(): number {
  return Date.now();
}

export default async function RunsPage() {
  await connection();
  const runs = await listRuns();
  const simulatedIds = PROVIDERS.filter((p) => p.simulated).map((p) => p.id);
  return <RunsList initialRuns={runs} now={requestTime()} simulatedIds={simulatedIds} />;
}
