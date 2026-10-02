import Link from "next/link";
import { REPO_URL, Wordmark } from "@/components/shell/logo";

const COLS = [
  {
    title: "Product",
    links: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/playground", label: "Playground" },
      { href: "/benchmarks", label: "Benchmarks" },
      { href: "/arena", label: "Arena" },
    ],
  },
  {
    title: "Learn",
    links: [
      { href: "/methodology", label: "Methodology" },
      { href: "/providers", label: "Supported routers" },
      { href: "/onboarding", label: "Setup guide" },
      { href: "/runs", label: "Saved runs" },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-bg-subtle">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-[1.5fr_1fr_1fr] sm:px-6">
        <div className="flex flex-col gap-3">
          <Wordmark />
          <p className="max-w-xs text-xs leading-relaxed text-fg-muted">
            Self-hosted benchmarking for LLM routers. Runs locally, keys stay on your machine, no account.
          </p>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-xs text-accent-text hover:underline">
            github.com/TCYTseven/tejrouter
          </a>
        </div>
        {COLS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="eyebrow mb-3">{c.title}</h2>
            <ul className="flex flex-col gap-2">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-fg-muted hover:text-fg">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-4 font-mono text-[11px] text-fg-subtle sm:px-6">
          TejRouter · the router that tests routers · built with Next.js
        </p>
      </div>
    </footer>
  );
}
