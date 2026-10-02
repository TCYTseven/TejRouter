import { SUITES, suiteInfo } from "@/lib/bench/suites";

/** Suite metadata for the run builder: `{ suites: SuiteInfo[] }`. */
export async function GET() {
  return Response.json({ suites: SUITES.map(suiteInfo) });
}
