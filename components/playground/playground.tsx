"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import type { ProviderStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { onCommand } from "@/components/shell/events";
import { OnboardingBanner } from "@/components/shell/onboarding-banner";
import { useStoredState } from "@/lib/client/storage";
import { Composer } from "./composer";
import { HistoryMenu, pushHistory } from "./history";
import { armSummary, metricDef, niceMax } from "./metrics";
import { ResponseColumn } from "./response-column";
import { RoundSummary } from "./summary";
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

/** Default routers: every configured real router, else the two practice routers. */
export function defaultArms(providers: ProviderStatus[]): ArmConfig[] {
  const real = providers.filter((p) => p.configured && !p.simulated);
  const pick = real.length ? real : providers.filter((p) => p.simulated);
  return pick.map((p) => ({ key: `arm-${p.id}`, providerId: p.id, model: "" }));
}

export function Playground({ providers }: { providers: ProviderStatus[] }) {
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
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const { round, running, start, stop, setVote } = usePlaygroundRunner();

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

  const finished = !!round && round.finishedAt != null;
  const hidden = !!round && round.settings.blind && !round.vote;
  const anyOk = !!round && round.arms.some((a) => okResults(a).length > 0);
  const latencyMax = round
    ? niceMax(Math.max(0, ...round.arms.flatMap((a) => armSummary(a, metricDef("latency")).values.filter((v): v is number => v != null))))
    : 1;
  const realConfigured = providers.filter((p) => p.configured && !p.simulated).length;

  const statusText = !round
    ? ""
    : running
      ? `Sending to ${round.arms.length} routers`
      : round.aborted
        ? "Stopped"
        : "All answers are in";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col">
      <PageHeader
        title="Compare"
        description="Send one prompt to several routers and read the answers side by side."
        actions={
          <HistoryMenu
            onPick={(e) => {
              setPrompt(e.prompt);
              setSystem(e.system);
              promptRef.current?.focus();
            }}
          />
        }
      />
      <OnboardingBanner realConfigured={realConfigured} className="mb-6" />

      <Composer
        prompt={prompt}
        onPrompt={setPrompt}
        promptRef={promptRef}
        system={system}
        onSystem={setSystem}
        arms={arms}
        onArms={(next) => setStoredArms(next)}
        providers={providers}
        providerMap={providerMap}
        settings={settings}
        onSettings={patch}
        running={running}
        canRun={canRun}
        onRun={run}
        onStop={stop}
      />

      <p className="sr-only" aria-live="polite">
        {statusText}
      </p>

      {round ? (
        <section aria-label="Answers" className="mt-10 flex flex-col gap-5">
          {finished && anyOk && round.arms.length > 1 ? <RoundSummary arms={round.arms} providers={providerMap} hidden={hidden} /> : null}
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
            {round.arms.map((a) => (
              <ResponseColumn
                key={`${round.id}-${a.key}`}
                arm={a}
                provider={providerMap[a.providerId]}
                hidden={hidden}
                winner={round.vote?.winner === a.armId}
                latencyMax={latencyMax}
              />
            ))}
          </div>
          {finished && !round.aborted && round.arms.length > 1 && round.arms.every(armDone) ? (
            <VotePanel round={round} providers={providerMap} onVote={setVote} />
          ) : null}
        </section>
      ) : (
        <p className="mt-8 text-center text-sm text-fg-muted">Answers appear here, one column per router.</p>
      )}
    </div>
  );
}
