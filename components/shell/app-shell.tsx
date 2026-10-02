import Link from "next/link";
import type { ReactNode } from "react";
import { IconGithub } from "@/components/ui/icons";
import { CommandPaletteTrigger } from "./command-palette";
import { REPO_URL, Wordmark } from "./logo";
import { MobileNav } from "./mobile-nav";
import { RouterStatusPill } from "./router-status";
import { SidebarNav } from "./sidebar-nav";
import { ThemeToggle } from "./theme-toggle";

export interface ShellStatus {
  live: number;
  total: number;
  simulators: number;
}

/** Sidebar application shell used by app/(app)/layout.tsx. */
export function AppShell({ children, status }: { children: ReactNode; status: ShellStatus }) {
  const pill = <RouterStatusPill {...status} />;
  return (
    <div className="relative min-h-dvh">
      <a
        href="#main"
        className="sr-only z-[100] rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-border bg-bg-subtle lg:flex">
        <div className="flex h-16 items-center px-4">
          <Link href="/" aria-label="TejRouter home" className="rounded-md">
            <Wordmark />
          </Link>
        </div>
        <div className="px-3 pb-3">
          <CommandPaletteTrigger className="w-full" />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <SidebarNav />
        </div>
        <div className="flex flex-col gap-2.5 border-t border-border p-3">
          {pill}
          <div className="flex items-center justify-between">
            <ThemeToggle />
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg"
              aria-label="TejRouter on GitHub (opens in a new tab)"
            >
              <IconGithub size={15} />
            </a>
          </div>
        </div>
      </aside>
      <MobileNav footer={pill} />
      <div className="relative lg:pl-[232px]">
        <div aria-hidden="true" className="bg-grid bg-grid-fade pointer-events-none absolute inset-x-0 top-0 h-[420px]" />
        <main id="main" tabIndex={-1} className="relative mx-auto w-full max-w-[1480px] px-4 py-6 focus:outline-none sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
