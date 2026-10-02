import { connection } from "next/server";
import { BenchLauncher } from "@/components/bench/bench-launcher";
import { SUITES, suiteInfo } from "@/lib/bench/suites";
import type { SuiteTokenPrior } from "@/lib/client/bench";
import { providerStatuses } from "@/lib/providers/server";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Benchmark",
  description:
    "Score LLM routers on graded tasks with known answers (math, reasoning, code, knowledge, long context, instruction following), with live results and a cost estimate before you start.",
  path: "/benchmarks",
});

/** Mean prompt tokens (chars / 4) and a rough completion prior per suite, for the cost estimate. */
function tokenPriors(): Record<string, SuiteTokenPrior> {
  const out: Record<string, SuiteTokenPrior> = {};
  for (const s of SUITES) {
    if (!s.tasks.length) continue;
    let prompt = 0;
    let completion = 0;
    for (const t of s.tasks) {
      prompt += Math.ceil(t.messages.reduce((n, m) => n + m.content.length, 0) / 4);
      // Short reasoning plus the answer; code answers are whole functions.
      completion += Math.ceil(t.expected.length / 4) + (t.grader.kind === "code" ? 220 : 90);
    }
    out[s.id] = { promptTokens: Math.round(prompt / s.tasks.length), completionTokens: Math.round(completion / s.tasks.length) };
  }
  return out;
}

export default async function BenchmarksPage() {
  await connection();
  return <BenchLauncher providers={providerStatuses()} suites={SUITES.map(suiteInfo)} tokenPriors={tokenPriors()} />;
}
