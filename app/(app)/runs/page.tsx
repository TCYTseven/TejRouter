import { connection } from "next/server";
import { RunsList } from "@/components/bench/runs-list";
import { listRuns } from "@/lib/bench/store";
import { PROVIDERS } from "@/lib/providers/registry";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Results",
  description:
    "Saved LLM router benchmark results: the leading router and its accuracy for each run, with import, download and full reports.",
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
