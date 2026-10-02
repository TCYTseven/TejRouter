import Link from "next/link";
import { REPO_URL } from "@/components/shell/logo";

const LINKS = [
  { href: "/playground", label: "Compare" },
  { href: "/benchmarks", label: "Benchmark" },
  { href: "/methodology", label: "Methodology" },
  { href: "/providers", label: "Routers" },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 text-sm text-fg-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>TejRouter, open source and self-hosted.</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-fg">
              {l.label}
            </Link>
          ))}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="hover:text-fg">
            GitHub<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </nav>
      </div>
    </footer>
  );
}
