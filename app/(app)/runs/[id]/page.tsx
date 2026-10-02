import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { RunReportView } from "@/components/report/report-view";
import { isValidRunId, loadRun } from "@/lib/bench/store";
import { pageMetadata } from "@/lib/seo";

/** Load once per request (shared by generateMetadata and the page). */
const getRun = cache(async (id: string) => (isValidRunId(id) ? loadRun(id) : null));

export async function generateMetadata({ params }: PageProps<"/runs/[id]">): Promise<Metadata> {
  const { id } = await params;
  const run = await getRun(id);
  if (!run) {
    return { ...pageMetadata({ title: "Run not found", description: "This benchmark run does not exist.", path: `/runs/${id}` }), robots: { index: false } };
  }
  const arms = run.arms.map((a) => a.label).join(", ");
  return pageMetadata({
    title: `${run.name || run.id} · Report`,
    description: `Statistical report for the benchmark run "${run.name || run.id}": ${run.arms.length} arms (${arms}) on ${run.tasks.length} tasks, with accuracy intervals, cost-quality frontier, latency distributions, routing adaptivity, oracle regret and pairwise tests.`.slice(0, 300),
    path: `/runs/${encodeURIComponent(id)}`,
  });
}

export default async function RunReportPage({ params }: PageProps<"/runs/[id]">) {
  const { id } = await params;
  const run = await getRun(id);
  if (!run) notFound();
  return <RunReportView id={id} name={run.name || run.id} />;
}
