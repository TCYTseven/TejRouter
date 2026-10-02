"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/client/cn";
import { IconSparkles } from "@/components/ui/icons";
import { isActive, NAV_ITEMS } from "./nav";

/** The nav list, shared by the desktop sidebar and the mobile drawer. */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
      <div className="eyebrow px-2.5 pb-1.5">Workspace</div>
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors",
              active ? "bg-surface-3 font-medium text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full transition-colors",
                active ? "bg-accent" : "bg-transparent",
              )}
            />
            <item.icon size={15} className={active ? "text-accent-text" : "text-fg-subtle group-hover:text-fg-muted"} />
            {item.label}
          </Link>
        );
      })}
      <div className="eyebrow mt-4 px-2.5 pb-1.5">Get started</div>
      <Link
        href="/onboarding"
        onClick={onNavigate}
        aria-current={isActive(pathname, "/onboarding") ? "page" : undefined}
        className={cn(
          "group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors",
          isActive(pathname, "/onboarding") ? "bg-surface-3 font-medium text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
        )}
      >
        <IconSparkles size={15} className="text-fg-subtle group-hover:text-fg-muted" />
        Setup guide
      </Link>
    </nav>
  );
}
