import { cn } from "@/lib/client/cn";

export const REPO_URL = "https://github.com/TCYTseven/TejRouter";

/** The TejRouter mark: one prompt fanning out to three routes, the chosen one emphasized. */
export function LogoMark({ size = 24, className }: { size?: number; className?: string; animated?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className={cn("shrink-0", className)}>
      <rect width="32" height="32" rx="8" fill="var(--fg)" />
      <path d="M9 16C14 16 15 9 23 9M9 16C14 16 15 23 23 23" stroke="var(--fg-inverse)" strokeOpacity=".45" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M9 16H23" stroke="var(--fg-inverse)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="9" cy="16" r="2.5" fill="var(--fg-inverse)" />
      <circle cx="23" cy="16" r="2.5" fill="var(--fg-inverse)" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string; subtitle?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark size={26} />
      <span className="text-[15px] font-semibold tracking-tight text-fg">TejRouter</span>
    </span>
  );
}
