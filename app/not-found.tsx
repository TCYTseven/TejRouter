import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/shell/logo";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
  description: "No page exists at this address.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center px-4 py-16 text-center">
      <Link href="/" aria-label="TejRouter home" className="rounded-lg">
        <LogoMark size={36} />
      </Link>
      <h1 className="mt-8 text-[28px] font-semibold tracking-tight text-fg">Page not found</h1>
      <p className="mt-2 max-w-sm text-[15px] text-fg-muted">There&apos;s nothing at this address. It may have moved, or the link has a typo.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        <ButtonLink href="/playground" variant="primary">
          Go to Compare
        </ButtonLink>
        <ButtonLink href="/" variant="secondary">
          Home
        </ButtonLink>
      </div>
    </main>
  );
}
