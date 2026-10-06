"use client";

import { useId, useState, type FormEvent } from "react";
import type { ProviderSpec } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { IconChevronDown, IconEye, IconEyeOff, IconKey } from "@/components/ui/icons";
import { ProviderDot } from "@/components/ui/provider";
import { useToast } from "@/components/ui/toast";
import { HealthResult, useHealthCheck } from "@/components/providers/health-check";
import { cn } from "@/lib/client/cn";
import { clearBrowserKeys, removeBrowserKey, saveBrowserKey, useBrowserKeys, type BrowserKey } from "@/lib/client/keys";

/** Settings: API keys kept in this browser's localStorage. */
export function ApiKeySettings({ providers }: { providers: ProviderSpec[] }) {
  const keys = useBrowserKeys();
  const toast = useToast();
  const saved = providers.filter((p) => keys[p.id]).length;

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="privacy-heading" className="flex gap-3 rounded-xl border border-border bg-surface p-6 max-sm:p-5">
        <IconKey size={18} className="mt-0.5 shrink-0 text-fg-muted" />
        <div className="flex flex-col gap-2">
          <h2 id="privacy-heading" className="text-[15px] font-semibold text-fg">
            Your keys are stored only in this browser
          </h2>
          <p className="text-sm text-fg-muted">
            They live in this browser&apos;s local storage. When you use one, your browser calls the router directly. If
            the router blocks calls from web pages, the request passes through TejRouter&apos;s server, which forwards it
            and saves nothing. Clearing this site&apos;s data removes the keys, and anyone who can use this browser profile
            can read them.
          </p>
        </div>
      </section>

      <section aria-labelledby="keys-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="keys-heading" className="text-lg font-semibold text-fg">
            API keys
          </h2>
          {saved ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (!window.confirm("Remove every API key saved in this browser?")) return;
                clearBrowserKeys();
                toast({ title: "All saved keys removed", tone: "success" });
              }}
            >
              Remove all
            </Button>
          ) : null}
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {providers.map((p) => (
            <KeyRow key={p.id} provider={p} saved={keys[p.id]} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function KeyRow({ provider: p, saved }: { provider: ProviderSpec; saved: BrowserKey | undefined }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const needsUrl = !p.baseUrl;
  const status = saved
    ? needsUrl && !saved.baseUrl
      ? "Saved, needs base URL"
      : `Saved, ending in ${saved.apiKey.slice(-4)}`
    : "Not saved";

  return (
    <li id={`key-${p.id}`} className="scroll-mt-24">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-start gap-3 rounded-xl px-5 py-4 text-left max-sm:px-4"
      >
        <ProviderDot provider={p} size={10} className="mt-[7px]" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-fg">{p.name}</span>
          <span className={cn("block text-sm", saved ? "text-fg" : "text-fg-muted")}>{status}</span>
        </span>
        <IconChevronDown
          size={16}
          className={cn("mt-1 shrink-0 text-fg-subtle transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open ? <KeyForm id={panelId} provider={p} saved={saved} /> : null}
    </li>
  );
}

function KeyForm({ id, provider: p, saved }: { id: string; provider: ProviderSpec; saved: BrowserKey | undefined }) {
  const toast = useToast();
  const uid = useId();
  const [apiKey, setApiKey] = useState(saved?.apiKey ?? "");
  const [baseUrl, setBaseUrl] = useState(saved?.baseUrl ?? "");
  const [model, setModel] = useState(saved?.model ?? "");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { state, run } = useHealthCheck(p.id);
  const needsUrl = !p.baseUrl;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const url = baseUrl.trim();
    if (!apiKey.trim()) return setError("Paste an API key first.");
    if (needsUrl && !url) return setError(`${p.name} needs a base URL: your deployment's /v1 address.`);
    if (url && !/^https?:\/\/[^\s/]+/i.test(url)) return setError("The base URL should start with https://");
    setError(null);
    if (!saveBrowserKey(p.id, { apiKey, baseUrl: url, model })) {
      return setError("This browser would not save it. Private windows and blocked site data prevent saving.");
    }
    toast({ title: `${p.name} key saved in this browser`, tone: "success" });
  };

  const remove = () => {
    removeBrowserKey(p.id);
    setApiKey("");
    setBaseUrl("");
    setModel("");
    toast({ title: `${p.name} key removed`, tone: "success" });
  };

  return (
    <form id={id} onSubmit={submit} className="flex flex-col gap-4 px-5 pb-5 pl-[42px] max-sm:px-4" autoComplete="off">
      <Field label="API key" htmlFor={`${uid}-key`} error={error}>
        <div className="relative">
          <Input
            id={`${uid}-key`}
            type={reveal ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste your key"
            autoComplete="off"
            spellCheck={false}
            mono
            className="pr-10"
            aria-invalid={error ? true : undefined}
          />
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md p-1.5 text-fg-subtle hover:text-fg"
            aria-label={reveal ? "Hide key" : "Show key"}
          >
            {reveal ? <IconEyeOff size={16} /> : <IconEye size={16} />}
          </button>
        </div>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={needsUrl ? "Base URL" : "Base URL (optional)"} htmlFor={`${uid}-url`}>
          <Input
            id={`${uid}-url`}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={p.baseUrl || "https://your-gateway.example.com/v1"}
            autoComplete="off"
            spellCheck={false}
            inputMode="url"
          />
        </Field>
        <Field label="Default model (optional)" htmlFor={`${uid}-model`}>
          <Input
            id={`${uid}-model`}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={p.autoModel ?? p.suggestedModels[0] ?? "Chosen per request"}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="primary">
          Save
        </Button>
        {saved ? (
          <>
            <Button type="button" size="sm" variant="secondary" onClick={run} loading={state.kind === "running"}>
              Test
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={remove}>
              Remove
            </Button>
          </>
        ) : null}
      </div>
      {state.kind !== "idle" ? <HealthResult state={state} /> : null}
    </form>
  );
}
