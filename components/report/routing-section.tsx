"use client";

import { useMemo, useState } from "react";
import { DataTable, Legend, LineChart, StackedBar, StackedBarRows, TipNote, TipRow, TipTitle, useChartTooltip, ChartTooltip, ordinalColor, vizStyles, type Segment } from "@/components/charts";
import { useElementWidth } from "@/components/charts/use-width";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconRoute } from "@/components/ui/icons";
import { StatTile } from "@/components/ui/stat";
import { Tabs } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import type { ModelShare, RoutingStats } from "@/lib/analysis/types";
import { cn } from "@/lib/client/cn";
import { ci, levelPct, num, pEq, pct, pval } from "./format";
import { ArmLabel, METHOD, ReportSection, Val, useReportCtx } from "./section";

interface ModelColor {
  model: string;
  color: string;
  price: number | null;
}

/** Run-wide model palette: ordinal by blended price (cheap = light), tail folded into "Other". */
function useModelPalette(routing: RoutingStats[]) {
  return useMemo(() => {
    const agg = new Map<string, { count: number; price: number | null }>();
    for (const r of routing)
      for (const m of r.models) {
        const e = agg.get(m.model) ?? { count: 0, price: m.blendedPrice };
        e.count += m.count;
        agg.set(m.model, e);
      }
    const all = [...agg.entries()].map(([model, e]) => ({ model, ...e }));
    const keep = all.length <= 7 ? all : [...all].sort((a, b) => b.count - a.count).slice(0, 6);
    const ordered = [...keep].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || a.model.localeCompare(b.model));
    const map = new Map<string, ModelColor>();
    ordered.forEach((m, i) => map.set(m.model, { model: m.model, color: m.price == null ? "var(--viz-other)" : ordinalColor(i, ordered.length), price: m.price }));
    return {
      list: ordered.map((m) => map.get(m.model)!),
      colorOf: (model: string) => map.get(model)?.color ?? "var(--viz-other)",
      inkOf: (model: string) => {
        const i = ordered.findIndex((m) => m.model === model);
        return i < 0 ? "var(--fg)" : i / Math.max(1, ordered.length - 1) > 0.5 ? "var(--viz-seq-ink-hi)" : "var(--viz-seq-ink-lo)";
      },
      folded: all.length > ordered.length,
    };
  }, [routing]);
}

type Palette = ReturnType<typeof useModelPalette>;

function segmentsOf(models: ModelShare[], pal: Palette, n: number, title: string): Segment[] {
  const out = new Map<string, Segment>();
  const ordered = [...models].sort((a, b) => (a.blendedPrice ?? Infinity) - (b.blendedPrice ?? Infinity));
  for (const m of ordered) {
    const known = pal.list.some((x) => x.model === m.model);
    const key = known ? m.model : "Other";
    const prev = out.get(key);
    const value = (prev?.value ?? 0) + m.share;
    out.set(key, {
      key,
      label: key,
      value,
      color: known ? pal.colorOf(m.model) : "var(--viz-other)",
      ink: known ? pal.inkOf(m.model) : "var(--fg)",
      tip: (
        <div>
          <TipTitle>{title}</TipTitle>
          <TipRow color={known ? pal.colorOf(m.model) : "var(--viz-other)"} shape="rect" label={key} value={pct(value)} sub={`${Math.round(value * n)} of ${n}`} />
          {m.blendedPrice != null ? <TipNote>List price ≈ ${m.blendedPrice.toFixed(2)} per 1M tokens (3:1 input:output).</TipNote> : <TipNote>Price unknown for this model.</TipNote>}
        </div>
      ),
    });
  }
  return [...out.values()];
}

export function RoutingSection({ index }: { index: number }) {
  const { report, arm } = useReportCtx();
  const routers = report.routing.filter((r) => r.kind === "router");
  const fixed = report.routing.filter((r) => r.kind === "fixed");
  const pal = useModelPalette(report.routing);
  const [tab, setTab] = useState<string>(routers[0]?.armId ?? "");
  const alpha = report.options.alpha;
  const active = routers.find((r) => r.armId === tab) ?? routers[0];

  const adaptive = routers.filter((r) => r.escalation?.pSlope != null && r.escalation.pSlope < alpha && (r.escalation.slope ?? 0) > 0);
  const takeaway = !routers.length ? (
    "No router arms in this run: every arm is pinned to one model, so there are no routing decisions to analyze."
  ) : (
    <>
      Routing analysis asks whether a router sends harder tasks to stronger, pricier models.{" "}
      {adaptive.length ? (
        <>
          <strong className="font-medium text-fg">{adaptive.map((r) => arm(r.armId).label).join(", ")}</strong> {adaptive.length === 1 ? "adapts" : "adapt"} significantly to difficulty
          {routers.length > adaptive.length ? <>; {routers.filter((r) => !adaptive.includes(r)).map((r) => arm(r.armId).label).join(", ")} show no measurable adaptivity</> : null}.
        </>
      ) : (
        <>None of the {routers.length} router{routers.length === 1 ? "" : "s"} shows a significant link between difficulty and the model served.</>
      )}
    </>
  );

  return (
    <ReportSection
      id="routing"
      index={index}
      title="Routing analysis"
      takeaway={takeaway}
      method={[METHOD.routing, METHOD.entropy, METHOD.mi, METHOD.jsd, METHOD.escalation]}
    >
      {routers.length === 0 ? (
        <EmptyState compact icon={<IconRoute size={18} />} title="No routers to analyze" description="Add an arm that lets the router choose (no pinned model, or its auto model) to see routing behaviour." />
      ) : (
        <>
          <AtAGlance routers={routers} />
          <div className="mt-6">
            {routers.length > 1 ? (
              <Tabs
                label="Router"
                value={active.armId}
                onChange={setTab}
                items={routers.map((r) => ({ value: r.armId, label: <ArmLabel arm={arm(r.armId)} className="max-w-[220px]" /> }))}
              />
            ) : null}
            <div className="pt-4">
              <RouterDetail r={active} pal={pal} />
            </div>
          </div>
        </>
      )}
      {fixed.length ? (
        <p className="mt-5 text-[11.5px] text-fg-subtle">
          Fixed baselines serve one model by construction:{" "}
          {fixed.map((f, i) => (
            <span key={f.armId}>
              {i ? "; " : ""}
              {arm(f.armId).label} → <span className="font-mono">{f.models[0]?.model ?? "unreported"}</span>
              {f.distinctModels > 1 ? ` (but served ${f.distinctModels} models)` : ""}
            </span>
          ))}
          .
        </p>
      ) : null}
    </ReportSection>
  );
}

function AtAGlance({ routers }: { routers: RoutingStats[] }) {
  const { arm, level } = useReportCtx();
  const L = levelPct(level);
  return (
    <DataTable
      caption="Routing adaptivity at a glance"
      rows={routers}
      getKey={(r) => r.armId}
      minWidth={860}
      columns={[
        { key: "arm", header: "Router", render: (r) => <ArmLabel arm={arm(r.armId)} /> },
        { key: "m", header: "Models", align: "right", render: (r) => (r.nWithModel ? r.distinctModels : <Val v={null} fmt={String} reason="router did not report served models" />), sort: (r) => r.distinctModels },
        { key: "esc", header: "Escalated", align: "right", render: (r) => <Val v={r.escalation?.rate} fmt={(v) => pct(v)} reason={r.escalationReason ?? "not estimable"} />, sort: (r) => r.escalation?.rate ?? null },
        {
          key: "slope",
          header: "Adaptivity slope",
          align: "right",
          render: (r) => (
            <span>
              <Val v={r.escalation?.slope} fmt={(v) => num(v, 2)} reason={r.escalationReason ?? "not estimable"} />
              {r.escalation?.slopeLo != null && r.escalation.slopeHi != null ? <span className="ml-1 text-fg-subtle">{ci(r.escalation.slopeLo, r.escalation.slopeHi, (v) => num(v, 1))}</span> : null}
            </span>
          ),
          sort: (r) => r.escalation?.slope ?? null,
        },
        { key: "p", header: "slope p", align: "right", render: (r) => <Val v={r.escalation?.pSlope} fmt={pval} reason={r.escalationReason ?? "not estimable"} />, sort: (r) => r.escalation?.pSlope ?? null },
        { key: "nmic", header: "NMI(category)", align: "right", render: (r) => <MIcell mi={r.categoryMI} />, sort: (r) => r.categoryMI?.nmi ?? null },
        { key: "nmid", header: "NMI(difficulty)", align: "right", render: (r) => <MIcell mi={r.difficultyMI} />, sort: (r) => r.difficultyMI?.nmi ?? null },
        { key: "jsd", header: "Easy–hard JSD", align: "right", render: (r) => <Val v={r.easyHardJsd?.value} fmt={(v) => num(v, 3)} reason="needs samples in two difficulty buckets" />, sort: (r) => r.easyHardJsd?.value ?? null },
        { key: "h", header: "Entropy (bits)", align: "right", render: (r) => <Val v={r.entropyBits} fmt={(v) => num(v, 2)} reason="no served models reported" />, sort: (r) => r.entropyBits },
      ]}
    />
  );
  void L;
}

function MIcell({ mi }: { mi: RoutingStats["categoryMI"] }) {
  if (!mi) return <Val v={null} fmt={String} reason="no served models reported" />;
  return (
    <span>
      {num(mi.nmi, 3)}
      <span className={cn("ml-1", mi.pValue < 0.05 ? "text-fg-muted" : "text-fg-subtle")}>({pEq(mi.pValue)})</span>
    </span>
  );
}

function RouterDetail({ r, pal }: { r: RoutingStats; pal: Palette }) {
  const { report, arm, level } = useReportCtx();
  const [allCats, setAllCats] = useState(false);
  const a = arm(r.armId);
  const L = levelPct(level);
  const alpha = report.options.alpha;
  if (r.nWithModel === 0) {
    return (
      <EmptyState
        compact
        icon={<IconRoute size={18} />}
        title={`${a.label} does not report its served model`}
        description="The router's responses carried no model id (in the body or routing headers), so its routing decisions cannot be observed. Accuracy, cost and latency are still analyzed; ask the vendor to expose the served model to unlock this section."
      />
    );
  }
  const e = r.escalation;
  const sigSlope = e?.pSlope != null && e.pSlope < alpha;
  const cats = [...r.byCategory].sort((x, y) => y.n - x.n);
  const shownCats = allCats ? cats : cats.slice(0, 8);
  const buckets = report.perArmDifficultyBucket.filter((b) => b.armId === r.armId && b.escalationRate != null && b.nSamples > 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Distinct models" value={r.distinctModels} sub={r.nUnknownModel ? `${r.nUnknownModel} samples unreported` : `${r.nWithModel} samples`} />
        <StatTile label="Escalation rate" value={<Val v={e?.rate} fmt={(v) => pct(v)} reason={r.escalationReason ?? "not estimable"} />} sub={e ? `${e.nEscalated} of ${e.n} to the pricier tier` : (r.escalationReason ?? "")} />
        <StatTile
          label="Adaptivity slope"
          value={<Val v={e?.slope} fmt={(v) => num(v, 2)} reason={r.escalationReason ?? "not estimable"} />}
          sub={e?.slopeLo != null && e.slopeHi != null ? `${L} CI ${num(e.slopeLo, 1)} to ${num(e.slopeHi, 1)} · ${pEq(e.pSlope)}` : "logit per unit difficulty"}
          emphasis={sigSlope && (e?.slope ?? 0) > 0}
        />
        <StatTile label="NMI (category; model)" value={<Val v={r.categoryMI?.nmi} fmt={(v) => num(v, 3)} reason="no served models reported" />} sub={r.categoryMI ? `G-test ${pEq(r.categoryMI.pValue)}` : ""} />
        <StatTile label="Easy vs hard JSD" value={<Val v={r.easyHardJsd?.value} fmt={(v) => num(v, 3)} reason="needs samples in two difficulty buckets" />} sub="bits; 0 = same mix, 1 = disjoint" />
        <StatTile label="Entropy" value={<Val v={r.entropyBits} fmt={(v) => `${num(v, 2)} bits`} reason="no served models reported" />} sub={r.normalizedEntropy != null ? `${pct(r.normalizedEntropy, 0)} of maximum` : ""} />
      </div>

      <Interpretation r={r} />

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <h4 className="mb-2 text-[12px] font-semibold text-fg">Served-model share</h4>
            <Legend
              className="mb-2"
              label="Served models, cheapest first"
              items={[
                ...pal.list.filter((m) => r.models.some((x) => x.model === m.model)).map((m) => ({ key: m.model, label: <span className="font-mono">{m.model}{m.price != null ? <span className="ml-1 font-sans text-fg-subtle">${m.price.toFixed(2)}/M</span> : null}</span>, color: m.color, shape: "rect" as const })),
                ...(r.models.some((x) => !pal.list.some((m) => m.model === x.model)) ? [{ key: "Other", label: "Other", color: "var(--viz-other)", shape: "rect" as const }] : []),
              ]}
            />
            <OverallBar r={r} pal={pal} />
          </div>
          <div>
            <h4 className="mb-2 text-[12px] font-semibold text-fg">By difficulty bucket</h4>
            <StackedBarRows
              ariaLabel="Served-model share by difficulty bucket"
              labelWidth={92}
              height={16}
              labelFormat={(s, share) => (share >= 0.1 ? `${Math.round(share * 100)}%` : "")}
              rows={r.byDifficulty.filter((b) => b.n > 0).map((b) => ({
                key: String(b.bucket),
                label: <span className="num">{b.label}</span>,
                text: `difficulty ${b.label}`,
                segments: segmentsOf(b.models, pal, b.n, `${a.label} · difficulty ${b.label}`),
                trailing: `n ${b.n}`,
              }))}
            />
          </div>
          <div>
            <h4 className="mb-2 text-[12px] font-semibold text-fg">By category</h4>
            <StackedBarRows
              ariaLabel="Served-model share by category"
              labelWidth={120}
              height={12}
              labelFormat={(s, share) => (share >= 0.15 ? `${Math.round(share * 100)}%` : "")}
              rows={shownCats.map((c) => ({
                key: c.category,
                label: c.category,
                text: c.category,
                segments: segmentsOf(c.models, pal, c.n, `${a.label} · ${c.category}`),
                trailing: `n ${c.n}`,
              }))}
            />
            {cats.length > 8 ? (
              <Button size="xs" variant="ghost" className="mt-1.5" onClick={() => setAllCats((s) => !s)}>
                {allCats ? "Show top 8" : `Show all ${cats.length} categories`}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="min-w-0">
          <h4 className="mb-1 text-[12px] font-semibold text-fg">Escalation curve</h4>
          {e && e.curve.length > 1 ? (
            <>
              <p className="mb-2 text-[11.5px] leading-relaxed text-fg-subtle">
                Probability of serving a pricier model ({e.definition.replace(/^escalated = /, "")}) vs difficulty: logistic fit with {L} band; squares are observed rates per bucket.
              </p>
              <LineChart
                series={[
                  {
                    key: r.armId,
                    label: a.label,
                    color: a.color,
                    points: e.curve.map((p) => ({ x: p.x, y: p.p })),
                    band: e.curve.map((p) => ({ x: p.x, lo: p.lo, hi: p.hi })),
                    dots: buckets.map((b) => ({
                      x: b.meanDifficulty ?? (b.lo + b.hi) / 2,
                      y: b.escalationRate!,
                      label: `difficulty ${b.label}: ${pct(b.escalationRate)} escalated (${b.nSamples} samples)`,
                      tip: (
                        <div>
                          <TipTitle>difficulty {b.label}</TipTitle>
                          <TipRow color={a.color} shape="rect" label="escalated" value={pct(b.escalationRate)} />
                          <TipNote>{b.nSamples} samples.</TipNote>
                        </div>
                      ),
                    })),
                  },
                ]}
                ariaLabel={`Escalation probability versus difficulty for ${a.label}`}
                description={`Slope ${num(e.slope, 2)}, ${pEq(e.pSlope)}; overall escalation rate ${pct(e.rate)}`}
                height={280}
                x={{ domain: [0, 1], format: (v) => v.toFixed(2), label: "Task difficulty", ticks: [0, 0.25, 0.5, 0.75, 1] }}
                y={{ domain: [0, 1], format: (v) => `${Math.round(v * 100)}%`, label: "P(escalate)", ticks: [0, 0.25, 0.5, 0.75, 1] }}
                formatValue={(v) => `${(v * 100).toFixed(1)}%`}
              />
              <dl className="mt-3 grid grid-cols-2 gap-x-4 text-[11.5px] sm:grid-cols-4">
                <Def label="Slope" value={`${num(e.slope, 2)} ${ci(e.slopeLo, e.slopeHi, (v) => num(v, 1))}`} />
                <Def label="Slope p" value={pval(e.pSlope)} />
                <Def label="Spearman ρ (price, difficulty)" value={num(e.spearman, 2)} />
                <Def label="d ln(price) / d difficulty" value={num(e.logPriceSlope, 2)} />
              </dl>
            </>
          ) : (
            <p className="rounded-md border border-dashed border-border-strong px-3 py-4 text-[12px] text-fg-muted">
              No escalation curve: {r.escalationReason ?? "not estimable"}. It needs the router to serve at least two models with known, different prices.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Def({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-1">
      <dt className="text-[10.5px] text-fg-subtle">{label}</dt>
      <dd className="num text-fg">{value}</dd>
    </div>
  );
}

function OverallBar({ r, pal }: { r: RoutingStats; pal: Palette }) {
  const { arm } = useReportCtx();
  const { containerRef, tip, bind } = useChartTooltip();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  return (
    <div ref={ref} className={vizStyles.viz}>
      <div ref={containerRef} className="relative">
        <StackedBar
          segments={segmentsOf(r.models, pal, r.nWithModel, `${arm(r.armId).label} · all tasks`)}
          height={22}
          ariaLabel={`Served-model share: ${r.models.map((m) => `${m.model} ${pct(m.share)}`).join(", ")}`}
          bind={bind}
          labelFormat={(s, share) => `${s.label} ${Math.round(share * 100)}%`}
        />
        <ChartTooltip tip={tip} containerWidth={width} />
      </div>
    </div>
  );
}

function Interpretation({ r }: { r: RoutingStats }) {
  const { report, arm } = useReportCtx();
  const alpha = report.options.alpha;
  const a = arm(r.armId);
  const e = r.escalation;
  const sig = e?.pSlope != null && e.pSlope < alpha;
  const first = e?.curve[0]?.p;
  const last = e?.curve[e.curve.length - 1]?.p;
  const level: "high" | "low" | "none" = !e ? "none" : sig && (e.slope ?? 0) > 0 ? "high" : "low";
  return (
    <div className={cn("rounded-md border px-3.5 py-3 text-[12.5px] leading-relaxed", level === "high" ? "border-accent-line bg-accent-soft/50" : "border-border bg-surface-2/60")}>
      <div className="mb-1 flex items-center gap-2">
        <Badge tone={level === "high" ? "accent" : "neutral"}>{level === "high" ? "High adaptivity" : level === "low" ? "Low adaptivity" : "Adaptivity not estimable"}</Badge>
        <Tooltip content="High adaptivity: the router's model choice tracks task difficulty, escalating hard tasks to stronger, pricier models and keeping easy ones cheap. Low adaptivity: model choice looks unrelated to difficulty (always one tier, or random).">
          <span tabIndex={0} className="cursor-help text-[11px] text-fg-subtle underline decoration-dotted underline-offset-2 outline-none">
            What does this mean?
          </span>
        </Tooltip>
      </div>
      <p className="text-fg-muted">
        {level === "high" ? (
          <>
            {a.label} sends harder tasks to pricier models: the fitted chance of escalating rises from <span className="num text-fg">{pct(first, 0)}</span> on the easiest tasks to{" "}
            <span className="num text-fg">{pct(last, 0)}</span> on the hardest ({pEq(e!.pSlope)}).
          </>
        ) : level === "low" ? (
          <>
            No evidence that {a.label}&apos;s model choice depends on difficulty ({pEq(e!.pSlope)}): it escalates about <span className="num text-fg">{pct(e!.rate, 0)}</span> of requests whatever the difficulty. A low-adaptivity router
            pays for a strong model on easy tasks or misses it on hard ones.
          </>
        ) : (
          <>{r.escalationReason ? `Escalation is not estimable: ${r.escalationReason}.` : "Escalation is not estimable."}</>
        )}{" "}
        {r.categoryMI ? (
          r.categoryMI.pValue < alpha ? (
            <>Its model choice also depends on the task category (normalized MI {num(r.categoryMI.nmi, 3)}, {pEq(r.categoryMI.pValue)}).</>
          ) : (
            <>Model choice is not significantly associated with category ({pEq(r.categoryMI.pValue)}).</>
          )
        ) : null}{" "}
        {r.easyHardJsd ? (
          <>
            The model mix on the easiest vs hardest bucket differs by JSD <span className="num text-fg">{num(r.easyHardJsd.value, 3)}</span> bits (0 = identical, 1 = no overlap).
          </>
        ) : null}{" "}
        {r.normalizedEntropy != null ? (
          r.normalizedEntropy < 0.2 ? <>It mostly uses a single model (entropy {pct(r.normalizedEntropy, 0)} of maximum).</> : r.normalizedEntropy > 0.8 ? <>It spreads traffic evenly across its models (entropy {pct(r.normalizedEntropy, 0)} of maximum).</> : null
        ) : null}
      </p>
    </div>
  );
}
