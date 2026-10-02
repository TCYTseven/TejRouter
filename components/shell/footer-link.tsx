"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/client/cn";
import { isActive } from "./nav";

/** Secondary sidebar link that shows its active state like the main nav items. */
export function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  const active = isActive(usePathname(), href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
        active ? "bg-surface-2 font-medium text-fg" : "text-fg-muted hover:bg-surface-2/60 hover:text-fg",
      )}
    >
      {children}
    </Link>
  );
}
