"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconChevronDown } from "@/components/ui/icons";
import { cn } from "@/lib/client/cn";

export interface TocEntry {
  id: string;
  num: string | null;
  title: string;
  level: 2 | 3;
}

/** Offset (px from the viewport top) at which a heading counts as "current". */
const SPY_OFFSET = 140;

/** Scrollspy: the current section is the last heading whose top has scrolled above SPY_OFFSET. */
function useScrollSpy(ids: string[]): { active: string | null } {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      let current: string | null = null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top - SPY_OFFSET <= 0) current = id;
        else break;
      }
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("hashchange", schedule);
    };
  }, [ids]);
  return { active };
}

/** The h2 that owns an id (an h3's parent section). */
function sectionOf(entries: TocEntry[], id: string | null): string | null {
  if (!id) return null;
  let owner: string | null = null;
  for (const e of entries) {
    if (e.level === 2) owner = e.id;
    if (e.id === id) return owner;
  }
  return null;
}

function EntryLink({
  e,
  active,
  onNavigate,
  compact,
}: {
  e: TocEntry;
  active: boolean;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  return (
    <a
      href={`#${e.id}`}
      onClick={onNavigate}
      aria-current={active ? "location" : undefined}
      data-toc-id={e.id}
      className={cn(
        "flex gap-2 rounded-md py-1 pr-2 text-sm leading-snug transition-colors",
        e.level === 2 ? "pl-3" : "pl-8",
        active ? "text-fg" : "text-fg-muted hover:text-fg",
        active && e.level === 2 && "font-medium",
        compact && "py-2",
      )}
    >
      {e.num && e.level === 2 ? <span className="num w-5 shrink-0 text-fg-muted">{e.num}</span> : null}
      <span className="min-w-0">{e.title}</span>
    </a>
  );
}

/** Sticky desktop table of contents: sections, plus the subsections of the current one. */
export function Toc({ entries }: { entries: TocEntry[] }) {
  const ids = useStableIds(entries);
  const { active } = useScrollSpy(ids);
  const section = sectionOf(entries, active);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the active entry visible inside the scrollable list (without moving the page).
  useEffect(() => {
    const box = listRef.current;
    if (!box || !active) return;
    const el = box.querySelector<HTMLElement>(`[data-toc-id="${CSS.escape(active)}"]`);
    if (!el) return;
    const top = el.offsetTop - box.offsetTop;
    if (top < box.scrollTop + 24 || top > box.scrollTop + box.clientHeight - 48)
      box.scrollTo({ top: Math.max(0, top - box.clientHeight / 3), behavior: "smooth" });
  }, [active]);

  return (
    <nav aria-label="On this page" className="flex max-h-[calc(100dvh-5rem)] flex-col">
      <p className="mb-2 pl-3 text-sm font-medium text-fg">On this page</p>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
        <ul>
          {entries.map((e) => {
            if (e.level === 3 && sectionOf(entries, e.id) !== section) return null;
            const isActive = e.level === 2 ? section === e.id : active === e.id;
            return (
              <li key={e.id} className={cn("border-l", isActive && e.level === 2 ? "border-fg" : "border-border")}>
                <EntryLink e={e} active={isActive} />
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

/** Collapsible contents for small screens, pinned under the mobile header. */
export function MobileToc({ entries }: { entries: TocEntry[] }) {
  const ids = useStableIds(entries);
  const { active } = useScrollSpy(ids);
  const [open, setOpen] = useState(false);
  const section = sectionOf(entries, active);
  const current = entries.find((e) => e.id === section);
  const h2 = entries.filter((e) => e.level === 2);
  return (
    <div className="sticky top-14 z-20 -mx-4 mb-10 border-y border-border bg-bg/95 backdrop-blur-md sm:-mx-8 lg:top-0 xl:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-toc-panel"
        onClick={() => setOpen((o) => !o)}
        className="flex h-12 w-full items-center gap-2 px-4 text-left text-sm sm:px-8"
      >
        <span className="min-w-0 flex-1 truncate">
          {current ? (
            <span className="text-fg">
              {current.num ? <span className="num mr-1.5 text-fg-muted">{current.num}</span> : null}
              {current.title}
            </span>
          ) : (
            <span className="text-fg-muted">Contents</span>
          )}
        </span>
        <IconChevronDown size={16} className={cn("shrink-0 text-fg-muted transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div id="mobile-toc-panel" className="max-h-[60dvh] overflow-y-auto overscroll-contain border-t border-border bg-bg px-1 py-2 sm:px-5">
          <ul>
            {h2.map((e) => (
              <li key={e.id}>
                <EntryLink e={e} active={section === e.id} compact onNavigate={() => setOpen(false)} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Stable id array per entries prop (entries come from a server component and never change). */
function useStableIds(entries: TocEntry[]): string[] {
  return useMemo(() => entries.map((e) => e.id), [entries]);
}
