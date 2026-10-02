import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { IconGithub } from "@/components/ui/icons";
import { REPO_URL, Wordmark } from "@/components/shell/logo";

export function LandingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="TejRouter home" className="rounded-md">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          <Link
            href="/methodology"
            className="hidden rounded-md px-2.5 py-1.5 text-sm text-fg-muted transition-colors hover:text-fg sm:block"
          >
            How it works
          </Link>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="TejRouter on GitHub (opens in a new tab)"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <IconGithub size={18} />
          </a>
          <ButtonLink href="/playground" variant="primary" size="sm" className="ml-1.5">
            Open app
          </ButtonLink>
        </nav>
      </div>
    </header>
  );
}
