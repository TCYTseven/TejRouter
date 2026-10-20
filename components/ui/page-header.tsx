import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/client/cn";
import { IconArrowLeft } from "./icons";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Page header: h1, one sentence of description, up to two actions. One per page.
 * Detail pages pass `back` for a single "← Results" link instead of breadcrumbs.
 * `breadcrumbs` is accepted for compatibility: its last linked crumb becomes the back link.
 */
export function PageHeader({
  title,
  description,
  breadcrumbs = [],
  back,
  actions,
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  breadcrumbs?: Crumb[];
  back?: Crumb;
  actions?: ReactNode;
  /** Ignored: headings carry no icons (CONTRIBUTING.md, "Design rules"). */
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const backLink = back ?? (breadcrumbs.length > 2 ? [...breadcrumbs].slice(0, -1).reverse().find((c) => c.href) : undefined);
  return (
    <header className={cn("flex flex-col gap-4 pb-8", className)}>
      {backLink?.href ? (
        <Link href={backLink.href} className="inline-flex w-fit items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
          <IconArrowLeft size={14} />
          {backLink.label}
        </Link>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-fg">{title}</h1>
          {description ? <p className="mt-2 max-w-2xl text-[15px] text-fg-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}
