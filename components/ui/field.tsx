import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/client/cn";
import { IconChevronDown } from "./icons";

const control =
  "w-full rounded-md border border-border bg-surface-2 text-sm text-fg placeholder:text-fg-subtle " +
  "transition-[border-color,box-shadow] duration-150 hover:border-border-strong " +
  "focus:border-accent-line focus:outline-none focus:ring-2 focus:ring-accent-soft focus-visible:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger/60";

export function Label({ className, ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-xs font-medium text-fg-muted", className)} {...rest} />;
}

export function Input({
  className,
  mono,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  return <input className={cn(control, "h-8 px-2.5", mono && "num text-[13px]", className)} {...rest} />;
}

export function Textarea({
  className,
  mono,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }) {
  return (
    <textarea
      className={cn(control, "min-h-20 resize-y px-3 py-2 leading-relaxed", mono && "font-mono text-[13px]", className)}
      {...rest}
    />
  );
}

/** Native select, styled. Native keeps keyboard + mobile pickers perfect. */
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn("relative", className)}>
      <select className={cn(control, "h-8 appearance-none pr-8 pl-2.5")} {...rest}>
        {children}
      </select>
      <IconChevronDown
        size={14}
        className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-fg-subtle"
      />
    </div>
  );
}

/** Label + control + hint/error, wired with ids for accessibility. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
  trailing,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Right-aligned content on the label row (e.g. current value). */
  trailing?: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {trailing}
      </div>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-[11px] text-fg-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
