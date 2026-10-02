import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { IconArrowRight, IconGithub } from "@/components/ui/icons";
import { REPO_URL, Wordmark } from "@/components/shell/logo";
import { ThemeCycleButton } from "@/components/shell/theme-toggle";
import { CommandPaletteTrigger } from "@/components/shell/command-palette";

const LINKS = [
  { href: "/playground", label: "Playground" },
  { href: "/benchmarks", label: "Benchmarks" },
  { href: "/methodology", label: "Methodology" },
];

export function LandingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/75 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="TejRouter home" className="rounded-md">
          <Wordmark subtitle={false} />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-md px-2.5 py-1.5 text-sm text-fg-muted transition-colors hover:text-fg">
              {l.label}
            </Link>
          ))}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
          >
            <IconGithub size={14} /> GitHub
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </nav>
        <div className="flex items-center gap-1.5">
          <CommandPaletteTrigger compact className="hidden lg:flex" />
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="TejRouter on GitHub (opens in a new tab)"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg md:hidden"
          >
            <IconGithub size={16} />
          </a>
          <ThemeCycleButton />
          <ButtonLink href="/dashboard" variant="accent" size="sm" rightIcon={<IconArrowRight size={13} />}>
            <span className="hidden sm:inline">Open dashboard</span>
            <span className="sm:hidden">Dashboard</span>
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
