import Link from "next/link";
import type { ReactNode } from "react";
import { IconBook, IconGithub } from "@/components/ui/icons";
import { CommandPaletteTrigger } from "./command-palette";
import { FooterLink } from "./footer-link";
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
        className="sr-only z-[100] rounded-lg bg-fg px-3 py-2 text-sm font-medium text-fg-inverse focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-bg lg:flex">
        <div className="flex h-16 items-center justify-between px-5">
          <Link href="/" aria-label="TejRouter home" className="rounded-md">
            <Wordmark />
          </Link>
          <CommandPaletteTrigger compact />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <SidebarNav />
        </div>
        <div className="flex flex-col gap-1 border-t border-border p-3">
          {pill}
          <FooterLink href="/methodology">
            <IconBook size={16} className="text-fg-subtle" />
            How it works
          </FooterLink>
          <div className="mt-1 flex items-center justify-between px-1">
            <ThemeToggle />
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle hover:bg-surface-2 hover:text-fg"
              aria-label="TejRouter on GitHub (opens in a new tab)"
            >
              <IconGithub size={16} />
            </a>
          </div>
        </div>
      </aside>
      <MobileNav footer={pill} />
      <div className="lg:pl-60">
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-8 focus:outline-none sm:px-8 sm:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
