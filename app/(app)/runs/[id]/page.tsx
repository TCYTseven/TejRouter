import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { ReportSkeleton, RunReportView } from "@/components/report/report-view";
import { isValidRunId, loadRun } from "@/lib/bench/store";
import { pageMetadata } from "@/lib/seo";

/** Load once per request (shared by generateMetadata and the page). */
const getRun = cache(async (id: string) => (isValidRunId(id) ? loadRun(id) : null));

export async function generateMetadata({ params }: PageProps<"/runs/[id]">): Promise<Metadata> {
  const { id } = await params;
  const run = await getRun(id);
  if (!run) {
    // The run may live only in the visitor's browser (lib/client/local-runs.ts).
    return { ...pageMetadata({ title: "Report", description: "A benchmark run report.", path: `/runs/${id}` }), robots: { index: false } };
  }
  const arms = run.arms.map((a) => a.label).join(", ");
  return pageMetadata({
    title: `${run.name || run.id} · Report`,
    description: `Which router to use, from the benchmark "${run.name || run.id}": ${run.arms.length} routers (${arms}) on ${run.tasks.length} tasks, compared on accuracy, cost and response time.`.slice(0, 300),
    path: `/runs/${encodeURIComponent(id)}`,
  });
}

export default async function RunReportPage({ params }: PageProps<"/runs/[id]">) {
  const { id } = await params;
  if (!isValidRunId(id)) notFound();
  // The server may not have it (serverless instances keep runs in memory): the client view
  // then reads this browser's copy, and says "Run not found" only when neither has it.
  const run = await getRun(id);
  const name = run ? run.name || run.id : "Report";
  return (
    <Suspense fallback={<ReportSkeleton name={name} stage="Loading the run" />}>
      <RunReportView id={id} name={name} />
    </Suspense>
  );
}
