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
  "w-full rounded-lg border border-border bg-surface text-[15px] text-fg placeholder:text-fg-subtle " +
  "transition-[border-color,box-shadow] duration-150 hover:border-border-strong " +
  "focus:border-link focus:outline-none focus:ring-2 focus:ring-link/20 focus-visible:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger/60";

export function Label({ className, ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium text-fg", className)} {...rest} />;
}

export function Input({
  className,
  mono,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  return <input className={cn(control, "h-9 px-3", mono && "num", className)} {...rest} />;
}

export function Textarea({
  className,
  mono,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }) {
  return (
    <textarea
      className={cn(control, "min-h-20 resize-y px-3 py-2 leading-relaxed", mono && "font-mono text-sm", className)}
      {...rest}
    />
  );
}

/** Native select, styled. Native keeps keyboard + mobile pickers perfect. */
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn("relative", className)}>
      <select className={cn(control, "h-9 appearance-none pr-9 pl-3 text-sm")} {...rest}>
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
        <p id={`${htmlFor}-error`} className="text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-[13px] text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
