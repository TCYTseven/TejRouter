"use client";

import { useEffect } from "react";
import { cn } from "@/lib/client/cn";
import { useStoredState } from "@/lib/client/storage";
import { applyTheme, THEME_KEY, type ThemePref } from "@/lib/client/theme";
import { IconMonitor, IconMoon, IconSun } from "@/components/ui/icons";

function isPref(v: unknown): v is ThemePref {
  return v === "system" || v === "dark" || v === "light";
}

/** Persisted theme preference + DOM sync (including live OS changes). */
export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useStoredState<ThemePref>(THEME_KEY, "system", isPref);
  useEffect(() => {
    applyTheme(pref);
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const on = () => applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [pref]);
  return [pref, setPref];
}

const OPTIONS: { value: ThemePref; label: string; Icon: typeof IconSun }[] = [
  { value: "system", label: "System theme", Icon: IconMonitor },
  { value: "dark", label: "Dark theme", Icon: IconMoon },
  { value: "light", label: "Light theme", Icon: IconSun },
];

/** Three-way segmented theme switch. */
export function ThemeToggle({ className }: { className?: string }) {
  const [pref, setPref] = useThemePref();
  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className={cn("inline-flex items-center gap-0.5 rounded-md border border-border bg-surface-2 p-0.5", className)}
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={pref === value}
          aria-label={label}
          title={label}
          onClick={() => setPref(value)}
          className={cn(
            "inline-flex h-6 w-7 items-center justify-center rounded-[5px] transition-colors",
            pref === value ? "bg-surface text-fg shadow-sm ring-1 ring-border-strong" : "text-fg-subtle hover:text-fg",
          )}
        >
          <Icon size={13} />
        </button>
      ))}
    </div>
  );
}

/** Single button that cycles system -> dark -> light. */
export function ThemeCycleButton({ className }: { className?: string }) {
  const [pref, setPref] = useThemePref();
  const i = OPTIONS.findIndex((o) => o.value === pref);
  const cur = OPTIONS[i] ?? OPTIONS[0];
  const next = OPTIONS[(i + 1) % OPTIONS.length];
  return (
    <button
      type="button"
      onClick={() => setPref(next.value)}
      aria-label={`${cur.label}. Switch to ${next.label.toLowerCase()}`}
      title={`${cur.label} (click for ${next.label.toLowerCase()})`}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg",
        className,
      )}
    >
      <cur.Icon size={16} />
    </button>
  );
}
