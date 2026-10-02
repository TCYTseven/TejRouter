import Link from "next/link";

export const SUMMARY_ID = "in-short";

/** Plain-English overview shown before the technical reference. */
export function Summary() {
  return (
    <section aria-labelledby={SUMMARY_ID}>
      <h2 id={SUMMARY_ID} className="scroll-mt-20 text-xl font-semibold tracking-tight text-fg xl:scroll-mt-8">
        In short
      </h2>
      <p className="mt-4">
        TejRouter sends the same set of graded tasks to every router and records whether each answer was right, what it
        cost and how long it took. Accuracy, cost per answer and speed are the headline numbers. The rest of this page
        explains how each one is computed and how much you can trust it.
      </p>
      <p className="mt-5">
        <strong className="font-semibold text-fg">Every number comes with a range.</strong> A benchmark is a sample: run it
        on different tasks and the results would move. So each headline number has a 95% interval, the range the true
        value plausibly falls in. Repeated attempts at one task share its difficulty, so the task, not the attempt, is the
        unit: 100 tasks tried five times counts as 100 data points, not 500.
      </p>
      <p className="mt-5">
        <strong className="font-semibold text-fg">Routers are compared task by task.</strong> Every router answers the same
        tasks, so comparisons pair them up per task. That cancels out the fact that some tasks are simply harder than
        others and reveals real differences with fewer tasks. When many pairs are compared at once, the bar for calling
        a difference real is raised, so a lucky result is not reported as a win.
      </p>
      <p className="mt-5">
        <strong className="font-semibold text-fg">Routing is checked, not assumed.</strong> A router&apos;s job is to pick
        the right model for each task. TejRouter records which model actually answered and asks whether that choice
        depends on the task: does the router send hard tasks to stronger, pricier models and easy ones to cheap models?
        When single-model baselines are in the run, each router is also compared with always using the best single
        model and with a perfect-hindsight choice.
      </p>
      <p className="mt-5">
        Your blind votes on the <Link href="/playground" className="text-link hover:underline">Compare</Link> page feed the{" "}
        <Link href="/arena" className="text-link hover:underline">Leaderboard</Link> through the same rating model, again
        with ranges that show which gaps are real.
      </p>
      <p className="mt-5 text-fg-muted">
        Everything below is the full technical reference: each formula, its assumptions, and where it appears in a report.
      </p>
    </section>
  );
}
