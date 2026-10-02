import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/client/cn";
import { IconChevronRight } from "./icons";

export interface Crumb {
  label: string;
  href?: string;
}

/** Consistent page header: breadcrumb, h1, description, actions. One per page. */
export function PageHeader({
  title,
  description,
  breadcrumbs = [],
  actions,
  icon,
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <header className={cn("flex flex-col gap-3 pb-5", className)}>
      {breadcrumbs.length ? (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 font-mono text-[11px] text-fg-subtle">
            {breadcrumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                {i > 0 ? <IconChevronRight size={10} className="opacity-60" /> : null}
                {c.href && i < breadcrumbs.length - 1 ? (
                  <Link href={c.href} className="rounded hover:text-fg">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current={i === breadcrumbs.length - 1 ? "page" : undefined} className={i === breadcrumbs.length - 1 ? "text-fg-muted" : undefined}>
                    {c.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-fg sm:text-2xl">
            {icon ? (
              <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface-2 text-accent-text">
                {icon}
              </span>
            ) : null}
            {title}
          </h1>
          {description ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-fg-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}
