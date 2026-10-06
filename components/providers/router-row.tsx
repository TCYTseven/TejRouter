"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import type { ProviderStatus } from "@/lib/types";
import { Button, ButtonLink } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { IconChevronDown, IconExternal } from "@/components/ui/icons";
import { ProviderDot } from "@/components/ui/provider";
import { cn } from "@/lib/client/cn";
import { buildEnvTemplate } from "@/lib/client/env-template";
import { useWithBrowserKey } from "@/lib/client/keys";
import { HealthResult, useHealthCheck } from "./health-check";
import { ModelList } from "./model-list";
import { RouterStatusText } from "./provider-status";

/**
 * One router as a list row: identity, status in words and a Test button.
 * Clicking the row (or "Set up") reveals how to configure it.
 */
export function RouterRow({ provider: serverProvider, expandable = true }: { provider: ProviderStatus; expandable?: boolean }) {
  const p = useWithBrowserKey(serverProvider);
  const [open, setOpen] = useState(false);
  const { state, run } = useHealthCheck(p.id);
  const panelId = useId();
  const canTest = p.configured || p.simulated;

  // Deep links like /providers#openrouter open that row.
  useEffect(() => {
    if (!expandable) return;
    const sync = () => {
      if (window.location.hash === `#${p.id}`) setOpen(true);
    };
    const t = window.setTimeout(sync, 0);
    window.addEventListener("hashchange", sync);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("hashchange", sync);
    };
  }, [expandable, p.id]);

  const identity = (
    <>
      <ProviderDot provider={p} size={10} className="mt-[7px]" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-fg">{p.name}</span>
        <span className="block text-sm text-fg-muted">{p.tagline}</span>
      </span>
      <RouterStatusText provider={p} className="shrink-0 max-sm:hidden" />
    </>
  );

  return (
    <li id={p.id} className="scroll-mt-24">
      <div className="flex items-start gap-3 px-5 py-4 max-sm:px-4">
        {expandable ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={panelId}
            className="-m-1 flex min-w-0 flex-1 items-start gap-3 rounded-lg p-1 text-left"
          >
            {identity}
            <IconChevronDown
              size={16}
              className={cn("mt-1 shrink-0 text-fg-subtle transition-transform", open && "rotate-180")}
              aria-hidden="true"
            />
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-start gap-3">{identity}</div>
        )}
        {canTest ? (
          <Button size="sm" variant="secondary" onClick={run} loading={state.kind === "running"} aria-label={`Test ${p.name}`}>
            Test
          </Button>
        ) : expandable ? (
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)} aria-controls={panelId}>
            Set up
          </Button>
        ) : (
          <ButtonLink size="sm" variant="ghost" href={`/providers#${p.id}`}>
            How to set up
          </ButtonLink>
        )}
      </div>
      <div
        className={cn(
          "-mt-2 flex-col gap-1 pr-5 pb-4 pl-[42px] max-sm:pr-4 max-sm:pl-[38px]",
          state.kind === "idle" ? "hidden max-sm:flex" : "flex",
        )}
      >
        <RouterStatusText provider={p} className="sm:hidden" />
        {state.kind !== "idle" ? <HealthResult state={state} /> : null}
      </div>
      {expandable && open ? <SetupDetails id={panelId} provider={p} /> : null}
    </li>
  );
}

function Env({ name }: { name: string }) {
  return <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[13px] text-fg">{name}</code>;
}

function SetupDetails({ id, provider: p }: { id: string; provider: ProviderStatus }) {
  const [primary, ...aliases] = p.keyEnvs;
  const rows: [string, ReactNode][] = [];

  if (p.simulated) {
    rows.push(["API key", "Not needed. This router runs inside TejRouter, offline."]);
  } else {
    rows.push([
      "API key",
      p.keySource === "browser" ? (
        <>
          Saved in this browser{p.keyHint ? `, ending in ${p.keyHint}` : ""}. Calls go straight from your browser to{" "}
          {p.name}.{" "}
          <Link href="/settings" className="text-link hover:underline">
            Change it in Settings
          </Link>
        </>
      ) : p.configured ? (
        <>
          Loaded from <Env name={p.keySource ?? primary} />
          {p.keyHint ? `, ending in ${p.keyHint}` : ""}.
        </>
      ) : (
        <>
          Add <Env name={primary} /> to <Env name=".env.local" />
          {aliases.length ? (
            <>
              {" "}
              (also accepted: {aliases.map((a, i) => (
                <span key={a}>
                  {i ? ", " : ""}
                  <Env name={a} />
                </span>
              ))}
              )
            </>
          ) : null}
          , then restart the app. Or{" "}
          <Link href="/settings" className="text-link hover:underline">
            add it in Settings
          </Link>
          , where it stays in this browser.
        </>
      ),
    ]);
    rows.push([
      "Base URL",
      p.effectiveBaseUrl ? (
        <span className="break-all">{p.effectiveBaseUrl}</span>
      ) : (
        <>
          Not set. Add <Env name={p.baseUrlEnv} /> with your deployment&apos;s /v1 URL, or set it in Settings.
        </>
      ),
    ]);
  }
  rows.push([
    "Default model",
    p.defaultModel ? (
      <span className="break-all">{p.defaultModel}</span>
    ) : p.modelEnv ? (
      <>
        None. Set <Env name={p.modelEnv} /> to choose one.
      </>
    ) : (
      "Chosen by the router"
    ),
  ]);
  if (p.docsUrl) {
    rows.push([
      "Docs",
      <a key="docs" href={p.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-link hover:underline">
        {p.docsUrl.replace(/^https?:\/\//, "")}
        <IconExternal size={13} />
        <span className="sr-only">(opens in a new tab)</span>
      </a>,
    ]);
  }

  return (
    <div id={id} className="flex flex-col gap-5 pr-5 pb-5 pl-[42px] max-sm:pr-4 max-sm:pl-4">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[120px_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-fg-muted max-sm:mt-1">{k}</dt>
            <dd className="min-w-0 text-fg">{v}</dd>
          </div>
        ))}
      </dl>
      {p.notes ? <p className="text-sm text-fg-muted">{p.notes}</p> : null}
      {!p.simulated && !p.configured ? (
        <div>
          <CopyButton text={buildEnvTemplate([p])} label={`Copy ${p.name} lines for .env.local`} toastTitle="Copied" size="sm" variant="secondary" />
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-fg">Models</h3>
        <ModelList providerId={p.id} providerName={p.name} />
      </div>
    </div>
  );
}
