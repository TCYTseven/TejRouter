import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { StarOnGithub } from "@/components/ui/star-on-github";
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
          <StarOnGithub href={REPO_URL} />
          <ButtonLink href="/playground" variant="primary" size="sm" className="ml-1.5">
            Open app
          </ButtonLink>
        </nav>
      </div>
    </header>
  );
}
