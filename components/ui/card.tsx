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
        "rounded-lg border border-border",
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
  icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
  titleAs?: "h2" | "h3" | "h4";
  icon?: ReactNode;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-border px-4 py-3", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="eyebrow mb-1">{eyebrow}</div> : null}
        <TitleTag className="flex items-center gap-2 text-sm font-semibold tracking-tight text-fg">
          {icon ? <span className="text-fg-subtle">{icon}</span> : null}
          {title}
        </TitleTag>
        {description ? <p className="mt-0.5 text-xs text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center gap-2 border-t border-border px-4 py-2.5 text-xs text-fg-muted", className)}
      {...rest}
    />
  );
}
