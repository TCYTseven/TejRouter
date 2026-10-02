"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IconMenu, IconSearch, IconX } from "@/components/ui/icons";
import { dispatchCommand } from "./events";
import { Wordmark } from "./logo";
import { SidebarNav } from "./sidebar-nav";
import { ThemeToggle } from "./theme-toggle";

/** Top bar + slide-in drawer for < lg screens. */
export function MobileNav({ footer }: { footer?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const [lastPath, setLastPath] = useState(pathname);

  // Close the drawer when the route changes (state derived during render).
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-border bg-bg/85 px-3 backdrop-blur-md lg:hidden">
        <Link href="/" aria-label="TejRouter home" className="rounded-md">
          <Wordmark subtitle={false} />
        </Link>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => dispatchCommand({ type: "open-palette" })}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg"
            aria-label="Open command palette"
          >
            <IconSearch size={17} />
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg"
            aria-label="Open navigation"
            aria-expanded={open}
            aria-controls="mobile-drawer"
          >
            <IconMenu size={18} />
          </button>
        </div>
      </header>
      {open ? (
        <div className="fixed inset-0 z-[80] lg:hidden" role="presentation">
          <div className="absolute inset-0 animate-fade-in bg-overlay" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            id="mobile-drawer"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 flex w-[min(300px,86vw)] animate-[rise_240ms_ease-out_both] flex-col border-r border-border bg-surface shadow-lg"
          >
            <div className="flex h-14 items-center justify-between border-b border-border px-3">
              <Wordmark />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg"
                aria-label="Close navigation"
              >
                <IconX size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <SidebarNav onNavigate={() => setOpen(false)} />
            </div>
            <div className="flex flex-col gap-3 border-t border-border p-3">
              {footer}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-fg-subtle">Theme</span>
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
