import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/client/cn";

/** Bordered surface. `inset` = recessed variant for nested panels. */
export function Card({
  className,
  inset,
  interactive,
  as: Tag = "div",
  ...rest
}: HTMLAttributes<HTMLElement> & { inset?: boolean; interactive?: boolean; as?: "div" | "section" | "article" | "li" }) {
  return (
    <Tag
      className={cn(
        "rounded-xl border border-border",
        inset ? "bg-surface-2" : "bg-surface shadow-sm",
        interactive && "transition-colors hover:border-border-strong",
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
  titleAs: TitleTag = "h2",
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
  titleAs?: "h2" | "h3" | "h4";
  /** Ignored: headings carry no icons (CONTRIBUTING.md, "Design rules"). */
  icon?: ReactNode;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-6 pt-5 pb-1 max-sm:px-5", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="eyebrow mb-1">{eyebrow}</div> : null}
        <TitleTag className="text-[15px] font-semibold tracking-tight text-fg">
          {title}
        </TitleTag>
        {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 py-5 max-sm:px-5", className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center gap-3 border-t border-border px-6 py-3.5 text-sm text-fg-muted max-sm:px-5", className)}
      {...rest}
    />
  );
}
