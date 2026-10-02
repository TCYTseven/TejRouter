import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/shell/logo";
import { CommandPaletteTrigger } from "@/components/shell/command-palette";
import { ButtonLink } from "@/components/ui/button";
import { IconArrowRight, IconLayout, IconTerminal } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Page not found",
  description: "No route matched this URL.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main id="main" className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-16">
      <div aria-hidden="true" className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_45%,#000_20%,transparent_100%)]" />
      <div className="relative flex w-full max-w-md flex-col items-center gap-6 text-center">
        <Link href="/" aria-label="TejRouter home" className="rounded-lg">
          <LogoMark size={44} />
        </Link>
        <div className="w-full overflow-hidden rounded-xl border border-border bg-surface text-left shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className="font-mono text-[11px] text-fg-subtle">router.resolve()</span>
            <span className="rounded border border-danger/30 bg-danger-soft px-1.5 font-mono text-[10px] text-danger">404</span>
          </div>
          <pre className="overflow-x-auto px-4 py-3 font-mono text-[12px] leading-6 text-fg-muted">
            <span className="text-fg-subtle">{"// tried every route we know"}</span>
            {"\n"}
            <span className="text-accent-text">ramp</span>        → no match{"\n"}
            <span className="text-accent-text">openrouter</span>  → no match{"\n"}
            <span className="text-accent-text">this page</span>   → <span className="text-danger">not found</span>
          </pre>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">No route matched this URL</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Even a perfect router can&apos;t serve a page that doesn&apos;t exist. Pick a destination instead.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <ButtonLink href="/dashboard" variant="accent" leftIcon={<IconLayout size={14} />}>
            Dashboard
          </ButtonLink>
          <ButtonLink href="/playground" variant="secondary" leftIcon={<IconTerminal size={14} />}>
            Playground
          </ButtonLink>
          <ButtonLink href="/" variant="ghost" rightIcon={<IconArrowRight size={14} />}>
            Home
          </ButtonLink>
        </div>
        <CommandPaletteTrigger className="w-full max-w-xs" />
      </div>
    </main>
  );
}
