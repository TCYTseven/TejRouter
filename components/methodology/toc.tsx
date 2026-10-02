"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconArrowUpRight, IconChevronDown, IconList } from "@/components/ui/icons";
import { cn } from "@/lib/client/cn";

export interface TocEntry {
  id: string;
  num: string | null;
  title: string;
  level: 2 | 3;
}

/** Offset (px from the viewport top) at which a heading counts as "current". */
const SPY_OFFSET = 140;

/**
 * Scrollspy: the current section is the last heading whose top has scrolled
 * above SPY_OFFSET. Also reports reading progress through the article (0..1).
 */
function useScrollSpy(ids: string[], articleId: string): { active: string | null; progress: number } {
  const [state, setState] = useState<{ active: string | null; progress: number }>({ active: null, progress: 0 });
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      let active: string | null = null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top - SPY_OFFSET <= 0) active = id;
        else break;
      }
      const art = document.getElementById(articleId);
      let progress = 0;
      if (art) {
        const r = art.getBoundingClientRect();
        const total = r.height - window.innerHeight;
        progress = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 1;
      }
      setState((s) => (s.active === active && Math.abs(s.progress - progress) < 0.002 ? s : { active, progress }));
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
  }, [ids, articleId]);
  return state;
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
        "relative flex items-baseline gap-2 rounded-md py-1 pr-2 text-[13px] leading-snug transition-colors",
        e.level === 2 ? "pl-3" : "pl-9 text-[12.5px]",
        active ? "font-medium text-fg" : "text-fg-muted hover:text-fg",
        compact && "py-1.5",
      )}
    >
      {active ? <span aria-hidden="true" className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-accent" /> : null}
      {e.num ? (
        <span className={cn("num shrink-0 text-[11px]", e.level === 2 ? "w-5" : "", active ? "text-accent-text" : "text-fg-subtle")}>{e.num}</span>
      ) : null}
      <span className="min-w-0">{e.title}</span>
    </a>
  );
}

/** Sticky desktop table of contents with scrollspy and reading progress. */
export function Toc({ entries, articleId, sourceUrl }: { entries: TocEntry[]; articleId: string; sourceUrl: string }) {
  const ids = useStableIds(entries);
  const { active, progress } = useScrollSpy(ids, articleId);
  const section = sectionOf(entries, active);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the active entry visible inside the scrollable TOC (without moving the page).
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
    <nav aria-label="On this page" className="flex max-h-[calc(100dvh-4rem)] flex-col">
      <div className="mb-3 flex items-center justify-between gap-2 pr-2">
        <span className="eyebrow flex items-center gap-1.5">
          <IconList size={12} /> On this page
        </span>
        <span className="num text-[11px] text-fg-subtle">{Math.round(progress * 100)}%</span>
      </div>
      <div className="mb-3 mr-2 h-[2px] overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
        <div className="h-full origin-left rounded-full bg-accent" style={{ transform: `scaleX(${progress})` }} />
      </div>
      <div ref={listRef} className="-ml-1 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 pb-2">
        <ul className="space-y-px">
          {entries.map((e) => {
            if (e.level === 3 && sectionOf(entries, e.id) !== section) return null;
            return (
              <li key={e.id}>
                <EntryLink e={e} active={e.level === 2 ? section === e.id : active === e.id} />
              </li>
            );
          })}
        </ul>
      </div>
      <div className="mt-2 flex flex-col gap-1.5 border-t border-border pt-3 pr-2 text-xs">
        <a href="#top" className="text-fg-muted hover:text-fg">
          ↑ Back to top
        </a>
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-fg-muted hover:text-fg">
          METHODOLOGY.md on GitHub <IconArrowUpRight size={12} />
        </a>
      </div>
    </nav>
  );
}

/** Collapsible TOC for small screens, pinned under the mobile header. */
export function MobileToc({ entries, articleId }: { entries: TocEntry[]; articleId: string }) {
  const ids = useStableIds(entries);
  const { active, progress } = useScrollSpy(ids, articleId);
  const [open, setOpen] = useState(false);
  const section = sectionOf(entries, active);
  const current = entries.find((e) => e.id === section);
  const h2 = entries.filter((e) => e.level === 2);
  return (
    <div className="sticky top-14 z-20 -mx-4 mb-6 border-y border-border bg-bg/90 backdrop-blur-md sm:-mx-6 lg:top-0 lg:-mx-8 xl:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-toc-panel"
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-full items-center gap-2 px-4 text-left sm:px-6 lg:px-8"
      >
        <IconList size={14} className="shrink-0 text-fg-subtle" />
        <span className="min-w-0 flex-1 truncate text-[13px]">
          {current ? (
            <>
              <span className="num mr-1.5 text-accent-text">{current.num}</span>
              <span className="text-fg">{current.title}</span>
            </>
          ) : (
            <span className="text-fg-muted">On this page · {h2.length} sections</span>
          )}
        </span>
        <IconChevronDown size={14} className={cn("shrink-0 text-fg-subtle transition-transform", open && "rotate-180")} />
      </button>
      <div className="h-[2px] bg-surface-3" aria-hidden="true">
        <div className="h-full origin-left bg-accent" style={{ transform: `scaleX(${progress})` }} />
      </div>
      {open ? (
        <div id="mobile-toc-panel" className="max-h-[60dvh] overflow-y-auto overscroll-contain border-t border-border bg-surface px-2 py-2 sm:px-4">
          <ul className="space-y-px">
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
