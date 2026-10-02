import { cn } from "@/lib/client/cn";

export const REPO_URL = "https://github.com/TCYTseven/tejrouter";

/**
 * The TejRouter mark: one prompt node fanning out to three routes, with the
 * chosen route lit in the accent color.
 */
export function LogoMark({ size = 24, className, animated }: { size?: number; className?: string; animated?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="8" fill="var(--surface-2)" stroke="var(--border-strong)" strokeWidth="1.5" />
      <path d="M9 16C14 16 15 8.5 23 8.5" stroke="var(--fg-subtle)" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M9 16C14 16 15 23.5 23 23.5" stroke="var(--fg-subtle)" strokeWidth="1.75" strokeLinecap="round" />
      <path
        d="M9 16H23"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={animated ? "4 3" : undefined}
        className={animated ? "motion-safe:[animation:dash-flow_1.2s_linear_infinite]" : undefined}
      />
      <circle cx="9" cy="16" r="2.6" fill="var(--fg)" />
      <circle cx="23" cy="8.5" r="2" fill="var(--fg-subtle)" />
      <circle cx="23" cy="23.5" r="2" fill="var(--fg-subtle)" />
      <circle cx="23" cy="16" r="2.6" fill="var(--accent)" />
    </svg>
  );
}

export function Wordmark({ className, subtitle = true }: { className?: string; subtitle?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark size={28} />
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-tight text-fg">
          Tej<span className="text-accent-text">Router</span>
        </span>
        {subtitle ? (
          <span className="mt-1 text-[10.5px] whitespace-nowrap text-fg-subtle">the router that tests routers</span>
        ) : null}
      </span>
    </span>
  );
}
