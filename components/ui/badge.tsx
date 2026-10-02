import type { HTMLAttributes } from "react";
import { cn } from "@/lib/client/cn";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "outline";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-3 text-fg-muted border-border",
  accent: "bg-accent-soft text-accent-text border-accent-line",
  success: "bg-success-soft text-success border-success/30",
  warning: "bg-warning-soft text-warning border-warning/30",
  danger: "bg-danger-soft text-danger border-danger/30",
  info: "bg-info-soft text-info border-info/30",
  outline: "bg-transparent text-fg-muted border-border-strong",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** Monospace text (ids, model names, env vars). */
  mono?: boolean;
  size?: "sm" | "md";
}

export function Badge({ tone = "neutral", mono, size = "sm", className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded border font-medium whitespace-nowrap",
        size === "sm" ? "h-5 px-1.5 text-[11px]" : "h-6 px-2 text-xs",
        mono && "font-mono tracking-tight",
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}

export type StatusKind = "ok" | "warn" | "error" | "idle" | "live" | "offline";

const dotColor: Record<StatusKind, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  error: "bg-danger",
  idle: "bg-fg-subtle",
  live: "bg-accent",
  offline: "bg-info",
};

/** Small status dot; `pulse` animates it (respecting reduced motion). */
export function StatusDot({
  status,
  pulse,
  className,
  label,
}: {
  status: StatusKind;
  pulse?: boolean;
  className?: string;
  /** Screen-reader label. */
  label?: string;
}) {
  return (
    <span className={cn("relative inline-flex h-2 w-2 shrink-0", className)} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {pulse ? (
        <span className={cn("absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping", dotColor[status])} />
      ) : null}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", dotColor[status])} />
    </span>
  );
}
