"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/client/cn";
import { writeStorage } from "@/lib/client/storage";
import { applyTheme, THEME_KEY, type ThemePref } from "@/lib/client/theme";
import {
  IconArrowRight,
  IconEyeOff,
  IconGithub,
  IconHome,
  IconMonitor,
  IconMoon,
  IconPlay,
  IconSearch,
  IconSparkles,
  IconStop,
  IconSun,
} from "@/components/ui/icons";
import { Kbd } from "@/components/ui/kbd";
import { dispatchCommand, onCommand } from "./events";
import { REPO_URL } from "./logo";
import { NAV_ITEMS } from "./nav";

interface Command {
  id: string;
  group: "Navigate" | "Actions" | "Theme" | "Links";
  label: string;
  hint?: string;
  icon: ReactNode;
  keywords?: string;
  run: () => void;
}

/** Global Cmd/Ctrl+K palette. Open programmatically with dispatchCommand({type:"open-palette"}). */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const listId = useId();

  const hide = () => {
    setOpen(false);
    window.setTimeout(() => restoreRef.current?.focus?.(), 0);
  };

  useEffect(() => {
    const show = () => {
      restoreRef.current = document.activeElement as HTMLElement | null;
      setQuery("");
      setActive(0);
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) setOpen(false);
        else show();
      }
    };
    window.addEventListener("keydown", onKey);
    const off = onCommand((c) => {
      if (c.type === "open-palette") show();
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      off();
    };
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => router.push(href);
    const setTheme = (t: ThemePref) => () => {
      writeStorage(THEME_KEY, t);
      applyTheme(t);
    };
    const onPlayground = pathname?.startsWith("/playground");
    const pg = (type: "playground:run" | "playground:stop" | "playground:toggle-blind") => () => {
      if (onPlayground) dispatchCommand({ type });
      else router.push("/playground");
    };
    return [
      { id: "home", group: "Navigate", label: "Landing page", icon: <IconHome size={15} />, keywords: "home index", run: go("/") },
      ...NAV_ITEMS.map<Command>((n) => ({
        id: `nav-${n.href}`,
        group: "Navigate",
        label: n.label,
        hint: n.description,
        icon: <n.icon size={15} />,
        run: go(n.href),
      })),
      { id: "onboarding", group: "Navigate", label: "Setup guide", hint: "Connect your routers in 3 steps", icon: <IconSparkles size={15} />, keywords: "onboarding keys env setup", run: go("/onboarding") },
      { id: "run", group: "Actions", label: onPlayground ? "Run prompt on all arms" : "New playground round", hint: "Ctrl/Cmd + Enter in the playground", icon: <IconPlay size={15} />, keywords: "start go send race", run: pg("playground:run") },
      ...(onPlayground
        ? [
            { id: "stop", group: "Actions" as const, label: "Stop the running round", icon: <IconStop size={15} />, keywords: "abort cancel", run: pg("playground:stop") },
            { id: "blind", group: "Actions" as const, label: "Toggle blind mode", icon: <IconEyeOff size={15} />, keywords: "arena anonymous vote", run: pg("playground:toggle-blind") },
          ]
        : []),
      { id: "bench", group: "Actions", label: "Run a benchmark", icon: <IconArrowRight size={15} />, keywords: "suite eval", run: go("/benchmarks") },
      { id: "theme-dark", group: "Theme", label: "Dark theme", icon: <IconMoon size={15} />, run: setTheme("dark") },
      { id: "theme-light", group: "Theme", label: "Light theme", icon: <IconSun size={15} />, run: setTheme("light") },
      { id: "theme-system", group: "Theme", label: "System theme", icon: <IconMonitor size={15} />, run: setTheme("system") },
      { id: "github", group: "Links", label: "Source on GitHub", icon: <IconGithub size={15} />, keywords: "repo code", run: () => window.open(REPO_URL, "_blank", "noopener") },
    ];
  }, [router, pathname]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? commands.filter((c) => `${c.label} ${c.hint ?? ""} ${c.keywords ?? ""} ${c.group}`.toLowerCase().includes(q))
    : commands;
  const safeActive = Math.min(active, Math.max(0, filtered.length - 1));

  if (!open) return null;

  const runAt = (i: number) => {
    const c = filtered[i];
    if (!c) return;
    setOpen(false);
    c.run();
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center px-3 pt-[12vh]" role="presentation">
      <div className="absolute inset-0 animate-fade-in bg-overlay backdrop-blur-[2px]" onClick={hide} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-lg animate-rise overflow-hidden rounded-xl border border-border-strong bg-surface shadow-lg"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            hide();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            runAt(safeActive);
          } else if (e.key === "Tab") {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-3.5">
          <IconSearch size={16} className="text-fg-subtle" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={filtered[safeActive] ? `${listId}-${filtered[safeActive].id}` : undefined}
            aria-label="Search commands"
            placeholder="Jump to a page or run an action…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            className="h-12 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul id={listId} role="listbox" aria-label="Commands" className="max-h-[50vh] overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-fg-subtle" role="presentation">
              No commands match “{query}”.
            </li>
          ) : null}
          {filtered.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <li key={c.id} role="presentation">
                {header ? <div className="eyebrow px-2.5 pt-2.5 pb-1">{header}</div> : null}
                <div
                  id={`${listId}-${c.id}`}
                  role="option"
                  aria-selected={i === safeActive}
                  onMouseMove={() => setActive(i)}
                  onClick={() => runAt(i)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm",
                    i === safeActive ? "bg-surface-3 text-fg" : "text-fg-muted",
                  )}
                >
                  <span className={cn(i === safeActive ? "text-accent-text" : "text-fg-subtle")}>{c.icon}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {c.label}
                    {c.hint ? <span className="ml-2 hidden text-xs text-fg-subtle sm:inline">{c.hint}</span> : null}
                  </span>
                  {i === safeActive ? <IconArrowRight size={13} className="text-fg-subtle" /> : null}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between border-t border-border px-3.5 py-2 text-[11px] text-fg-subtle">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate <Kbd>↵</Kbd> run
          </span>
          <span className="flex items-center gap-1">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd> toggle
          </span>
        </div>
      </div>
    </div>
  );
}

/** Button that opens the palette (shows the shortcut). */
export function CommandPaletteTrigger({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => dispatchCommand({ type: "open-palette" })}
      className={cn(
        "flex h-8 items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 text-xs text-fg-subtle transition-colors hover:border-border-strong hover:text-fg",
        className,
      )}
      aria-label="Open command palette"
      aria-keyshortcuts="Meta+K Control+K"
    >
      <IconSearch size={13} />
      {compact ? null : <span className="flex-1 text-left">Search or jump…</span>}
      <span className="flex items-center gap-0.5">
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}
