import type { ComponentType } from "react";
import { IconActivity, IconGauge, IconHash, IconRoute, IconSigma, type IconProps } from "@/components/ui/icons";
import { methodologyHref } from "@/lib/client/slug";

const PRINCIPLES: { icon: ComponentType<IconProps>; title: string; body: string; section: string }[] = [
  {
    icon: IconHash,
    title: "Tasks are the unit",
    body: "Repetitions of one prompt share its difficulty, so they are averaged into one cell and resampled together. 100 tasks × 5 reps is not 500 data points.",
    section: "1. Principles",
  },
  {
    icon: IconGauge,
    title: "Intervals, not point estimates",
    body: "Every headline number ships with a 95% interval: cluster bootstrap (BCa) for accuracy, Wilson for rates, bootstrap ranks for ratings.",
    section: "6. The bootstrap",
  },
  {
    icon: IconActivity,
    title: "Paired tests",
    body: "Routers see the same tasks, so comparisons pair them by task (McNemar, sign-flip permutation, paired bootstrap) and cancel task-to-task noise.",
    section: "16. Pairwise comparisons",
  },
  {
    icon: IconSigma,
    title: "Multiple-comparison correction",
    body: "Eight routers make 28 pairs. Holm controls the chance of any false positive; Benjamini-Hochberg is reported for screening.",
    section: "19. Multiple comparisons",
  },
  {
    icon: IconRoute,
    title: "Routing measured by information theory",
    body: "Entropy, mutual information between task and chosen model, and easy-vs-hard divergence show whether a router adapts or just picks one model.",
    section: "14. Routing behaviour",
  },
];

/** The five ideas the rest of the document elaborates. */
export function IntroCard() {
  return (
    <section
      aria-labelledby="philosophy-title"
      className="relative overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
    >
      <div aria-hidden="true" className="bg-dots pointer-events-none absolute inset-0 opacity-60 [mask-image:linear-gradient(to_bottom,#000,transparent_70%)]" />
      <div className="relative border-b border-border px-5 py-4 sm:px-6">
        <p className="eyebrow">The philosophy in one card</p>
        <h2 id="philosophy-title" className="mt-1 text-base font-semibold tracking-tight text-fg">
          Measure routers the way you would run a clinical trial
        </h2>
      </div>
      <ul className="relative grid gap-px bg-border sm:grid-cols-2">
        {PRINCIPLES.map((p, i) => (
          <li key={p.title} className={i === PRINCIPLES.length - 1 ? "bg-surface sm:col-span-2" : "bg-surface"}>
            <a href={methodologyHref(p.section).replace("/methodology", "")} className="group flex h-full gap-3 px-5 py-4 transition-colors hover:bg-surface-2 sm:px-6">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-accent-line bg-accent-soft text-accent-text">
                <p.icon size={14} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium text-fg group-hover:underline group-hover:decoration-accent-line group-hover:underline-offset-[3px]">
                  {p.title}
                </span>
                <span className="mt-1 block text-[12.5px] leading-relaxed text-fg-muted">{p.body}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
