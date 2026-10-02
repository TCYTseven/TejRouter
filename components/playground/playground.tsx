"use client";

import { useEffect, useEffectEvent, useId, useMemo, useRef, useState } from "react";
import type { ProviderStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/field";
import {
  IconChevronRight,
  IconDice,
  IconEyeOff,
  IconPlay,
  IconRefresh,
  IconRoute,
  IconSliders,
  IconStop,
  IconTerminal,
  IconX,
} from "@/components/ui/icons";
import { Kbd } from "@/components/ui/kbd";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { PageHeader } from "@/components/ui/page-header";
import { onCommand } from "@/components/shell/events";
import { OnboardingBanner } from "@/components/shell/onboarding-banner";
import { cn } from "@/lib/client/cn";
import { formatMs } from "@/lib/client/format";
import { useStoredState } from "@/lib/client/storage";
import { ArmPicker } from "./arm-picker";
import { ComparisonStrip } from "./comparison-strip";
import { HistoryMenu, pushHistory } from "./history";
import { RepeatStats } from "./repeat-stats";
import { ResponseColumn } from "./response-column";
import { armDone, okResults, type ArmConfig, type GenSettings, type ProviderMap } from "./types";
import { usePlaygroundRunner } from "./use-runner";
import { VotePanel } from "./vote-panel";

const SETTINGS_KEY = "tejrouter.playground.settings";
const ARMS_KEY = "tejrouter.playground.arms";

const DEFAULT_SETTINGS: GenSettings = { temperature: 0.7, maxTokens: 512, seed: null, repeat: 1, blind: false };
const NO_ARMS: ArmConfig[] | null = null;

const DEFAULT_PROMPT =
  "Explain the difference between a mutex and a semaphore in two sentences, then show a minimal Python example of each.";

function isSettings(v: unknown): v is GenSettings {
  return !!v && typeof v === "object" && typeof (v as GenSettings).temperature === "number";
}
function isArms(v: unknown): v is ArmConfig[] | null {
  return v === null || (Array.isArray(v) && v.every((a) => a && typeof a.providerId === "string"));
}

/** Default arms: every configured real router, else the two simulators. */
export function defaultArms(providers: ProviderStatus[]): ArmConfig[] {
  const real = providers.filter((p) => p.configured && !p.simulated);
  const pick = real.length ? real : providers.filter((p) => p.simulated);
  return pick.map((p) => ({ key: `arm-${p.id}`, providerId: p.id, model: "" }));
}

export function Playground({ providers, envTemplate }: { providers: ProviderStatus[]; envTemplate: string }) {
  const providerMap = useMemo<ProviderMap>(() => Object.fromEntries(providers.map((p) => [p.id, p])), [providers]);
  const [stored, setSettings] = useStoredState<GenSettings>(SETTINGS_KEY, DEFAULT_SETTINGS, isSettings);
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...stored }), [stored]);
  const [storedArms, setStoredArms] = useStoredState<ArmConfig[] | null>(ARMS_KEY, NO_ARMS, isArms);
  const arms = useMemo(() => {
    const valid = (storedArms ?? []).filter((a) => providerMap[a.providerId]);
    return valid.length ? valid : defaultArms(providers);
  }, [storedArms, providerMap, providers]);

  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [system, setSystem] = useState("");
  const [systemOpen, setSystemOpen] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const ids = useId();

  const { round, running, start, stop, setVote, clear } = usePlaygroundRunner();

  const patch = (p: Partial<GenSettings>) => setSettings((s) => ({ ...DEFAULT_SETTINGS, ...s, ...p }));
  const canRun = !running && prompt.trim().length > 0 && arms.length > 0;

  const run = () => {
    if (!canRun) return;
    pushHistory(prompt, system);
    start({ prompt, system, arms, settings });
  };

  // Keyboard + command palette wiring (Effect Events read the latest state).
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      run();
    }
  });
  const onCmd = useEffectEvent((type: string) => {
    if (type === "playground:run") run();
    else if (type === "playground:stop") stop();
    else if (type === "playground:toggle-blind") patch({ blind: !settings.blind });
    else if (type === "playground:focus-prompt") promptRef.current?.focus();
  });
  useEffect(() => {
    const k = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", k);
    const off = onCommand((c) => onCmd(c.type));
    return () => {
      window.removeEventListener("keydown", k);
      off();
    };
  }, []);

  // Elapsed clock while a round is running.
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(t);
  }, [running]);

  const totalCalls = round ? round.arms.length * round.settings.repeat : 0;
  const doneCalls = round
    ? round.arms.reduce((n, a) => n + a.reps.filter((r) => r.status !== "pending" && r.status !== "streaming").length, 0)
    : 0;
  const finished = !!round && round.finishedAt != null;
  const hidden = !!round && round.settings.blind && !round.vote;
  const anyOk = !!round && round.arms.some((a) => okResults(a).length > 0);
  const elapsed = round ? (round.finishedAt ?? Math.max(now, round.startedAt)) - round.startedAt : 0;
  const statusText = !round
    ? "Idle"
    : running
      ? `Running: ${doneCalls} of ${totalCalls} calls finished`
      : round.aborted
        ? `Stopped after ${doneCalls} of ${totalCalls} calls`
        : `Round complete: ${totalCalls} calls in ${formatMs(elapsed)}`;

  const realConfigured = providers.filter((p) => p.configured && !p.simulated).length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        className="pb-0"
        breadcrumbs={[{ label: "TejRouter", href: "/" }, { label: "Playground" }]}
        icon={<IconTerminal size={16} />}
        title="Playground"
        description="Send one prompt to several routers at once and compare the streams, the routing decisions and the bill, side by side."
        actions={
          <HistoryMenu
            onPick={(e) => {
              setPrompt(e.prompt);
              setSystem(e.system);
              if (e.system) setSystemOpen(true);
              promptRef.current?.focus();
            }}
          />
        }
      />
      <OnboardingBanner realConfigured={realConfigured} envTemplate={envTemplate} className="mb-0" />

      {/* Composer */}
      <section aria-label="Prompt and settings" className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-sm focus-within:border-border-strong">
          <div className="border-b border-border">
            <button
              type="button"
              onClick={() => setSystemOpen((o) => !o)}
              aria-expanded={systemOpen}
              aria-controls={`${ids}-system`}
              className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium text-fg-muted hover:text-fg"
            >
              <IconChevronRight size={12} className={cn("transition-transform", systemOpen && "rotate-90")} />
              System prompt
              {system.trim() && !systemOpen ? (
                <span className="ml-1 truncate font-normal text-fg-subtle">“{system.trim().slice(0, 60)}”</span>
              ) : null}
              {!system.trim() ? <span className="font-normal text-fg-subtle">(optional)</span> : null}
            </button>
            {systemOpen ? (
              <div id={`${ids}-system`} className="px-3 pb-3">
                <label htmlFor={`${ids}-system-input`} className="sr-only">
                  System prompt
                </label>
                <textarea
                  id={`${ids}-system-input`}
                  value={system}
                  onChange={(e) => setSystem(e.target.value)}
                  rows={3}
                  placeholder="You are a concise senior engineer…"
                  className="w-full resize-y rounded-md border border-border bg-surface-2 px-3 py-2 text-sm leading-relaxed text-fg placeholder:text-fg-subtle focus:border-accent-line focus:ring-2 focus:ring-accent-soft focus:outline-none"
                />
              </div>
            ) : null}
          </div>
          <label htmlFor={`${ids}-prompt`} className="sr-only">
            Prompt
          </label>
          <textarea
            id={`${ids}-prompt`}
            ref={promptRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            placeholder="Ask something. Every selected router gets the exact same request."
            className="min-h-[132px] w-full flex-1 resize-y bg-transparent px-3 py-3 text-[15px] leading-relaxed text-fg placeholder:text-fg-subtle focus:outline-none"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-bg-subtle/60 px-3 py-2">
            <div className="flex items-center gap-3 text-[11px] text-fg-subtle">
              <span className="num">{prompt.length} chars</span>
              <span className="hidden items-center gap-1 sm:flex">
                <Kbd>⌘</Kbd>
                <Kbd>↵</Kbd> to run
              </span>
              {settings.blind ? (
                <Badge tone="accent">
                  <IconEyeOff size={11} /> blind
                </Badge>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {running ? (
                <Button variant="danger" size="md" onClick={stop} leftIcon={<IconStop size={13} />}>
                  Stop
                </Button>
              ) : null}
              <Button
                variant="accent"
                size="md"
                onClick={run}
                disabled={!canRun}
                loading={running}
                leftIcon={running ? undefined : <IconPlay size={13} />}
                aria-keyshortcuts="Meta+Enter Control+Enter"
              >
                {running ? "Racing…" : `Run on ${arms.length} ${arms.length === 1 ? "arm" : "arms"}${settings.repeat > 1 ? ` × ${settings.repeat}` : ""}`}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm">
          <h2 className="flex items-center gap-2 text-xs font-semibold text-fg">
            <IconSliders size={14} className="text-fg-subtle" /> Generation settings
          </h2>
          <Slider
            id={`${ids}-temp`}
            label="Temperature"
            value={settings.temperature}
            min={0}
            max={2}
            step={0.05}
            onChange={(v) => patch({ temperature: v })}
            format={(v) => v.toFixed(2)}
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-max`}>Max tokens</Label>
              <Input
                id={`${ids}-max`}
                type="number"
                mono
                inputMode="numeric"
                min={1}
                max={32000}
                value={settings.maxTokens}
                onChange={(e) => patch({ maxTokens: Math.max(1, Math.min(32000, Number(e.target.value) || 1)) })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-seed`}>Seed</Label>
              <div className="flex gap-1">
                <Input
                  id={`${ids}-seed`}
                  type="number"
                  mono
                  inputMode="numeric"
                  placeholder="random"
                  value={settings.seed ?? ""}
                  onChange={(e) => patch({ seed: e.target.value === "" ? null : Math.trunc(Number(e.target.value)) })}
                />
                <Button
                  size="icon"
                  variant="secondary"
                  aria-label="Random seed"
                  title="Random seed"
                  onClick={() => patch({ seed: Math.floor(Math.random() * 100000) })}
                >
                  <IconDice size={14} />
                </Button>
              </div>
            </div>
          </div>
          <Slider
            id={`${ids}-repeat`}
            label="Repeat per arm"
            value={settings.repeat}
            min={1}
            max={10}
            onChange={(v) => patch({ repeat: v })}
            format={(v) => (v === 1 ? "1 run" : `${v} runs`)}
          />
          <Toggle
            checked={settings.blind}
            onChange={(v) => patch({ blind: v })}
            label="Blind mode"
            description="Shuffle columns and hide router names until you vote"
          />
        </div>
      </section>

      {/* Arms */}
      <section aria-labelledby={`${ids}-arms`} className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 id={`${ids}-arms`} className="flex items-center gap-2 text-sm font-semibold text-fg">
            <IconRoute size={15} className="text-fg-subtle" />
            Arms
            <span className="num text-xs font-normal text-fg-subtle">{arms.length}</span>
          </h2>
          <Button size="xs" variant="ghost" onClick={() => setStoredArms(null)} disabled={running} leftIcon={<IconRefresh size={12} />}>
            Reset
          </Button>
        </div>
        <ArmPicker
          arms={arms}
          onChange={(next) => setStoredArms(next)}
          providers={providers}
          providerMap={providerMap}
          disabled={running}
          blind={settings.blind}
        />
      </section>

      {/* Results */}
      <section aria-labelledby={`${ids}-results`} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id={`${ids}-results`} className="text-sm font-semibold text-fg">
            Results
          </h2>
          {round ? (
            <div className="flex items-center gap-3">
              <span className="num text-[11px] text-fg-subtle">
                {doneCalls}/{totalCalls} calls · {formatMs(elapsed)}
              </span>
              {!running ? (
                <Button size="xs" variant="ghost" onClick={clear} leftIcon={<IconX size={12} />}>
                  Clear
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        <p className="sr-only" aria-live="polite" role="status">
          {statusText}
        </p>
        {round ? (
          <div
            className="h-0.5 w-full overflow-hidden rounded-full bg-surface-3"
            role="progressbar"
            aria-label="Round progress"
            aria-valuemin={0}
            aria-valuemax={totalCalls}
            aria-valuenow={doneCalls}
          >
            <div
              className={cn("h-full rounded-full transition-[width] duration-300", round.aborted ? "bg-fg-subtle" : "bg-accent")}
              style={{ width: `${totalCalls ? (doneCalls / totalCalls) * 100 : 0}%` }}
            />
          </div>
        ) : null}

        {!round ? (
          <EmptyState
            icon={<IconTerminal size={18} />}
            title="Race your first prompt"
            description="Pick the arms above and press Run. Each router streams into its own column, then TejRouter ranks them on TTFT, latency, cost and tokens."
            action={
              <Button variant="accent" size="sm" onClick={run} disabled={!canRun} leftIcon={<IconPlay size={12} />}>
                Run now
              </Button>
            }
          />
        ) : (
          <>
            {finished && anyOk && round.arms.length > 1 ? (
              <ComparisonStrip arms={round.arms} providers={providerMap} hidden={hidden} />
            ) : null}
            {finished && anyOk && round.settings.repeat > 1 ? (
              <RepeatStats arms={round.arms} providers={providerMap} hidden={hidden} />
            ) : null}
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
              {round.arms.map((a) => (
                <ResponseColumn
                  key={`${round.id}-${a.key}`}
                  arm={a}
                  provider={providerMap[a.providerId]}
                  hidden={hidden}
                  winner={round.vote?.winner === a.armId}
                />
              ))}
            </div>
            {finished && !round.aborted && round.arms.length > 1 && round.arms.every(armDone) ? (
              <div>
                <VotePanel round={round} providers={providerMap} onVote={setVote} />
              </div>
            ) : null}
          </>
        )}
      </section>

    </div>
  );
}
