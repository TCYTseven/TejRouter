"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/client/cn";
import { IconAlert, IconCheckCircle, IconInfo, IconX } from "./icons";

export type ToastTone = "info" | "success" | "error";
export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** ms before auto-dismiss (default 3500; errors 6000). */
  duration?: number;
}
interface ToastItem extends Required<Pick<ToastInput, "title" | "tone">> {
  id: number;
  description?: string;
}

type ToastFn = (t: ToastInput | string) => void;
const ToastContext = createContext<ToastFn | null>(null);

/** `const toast = useToast(); toast({ title: "Copied", tone: "success" })` */
export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  return ctx ?? noop;
}
function noop() {}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const push = useCallback<ToastFn>(
    (input) => {
      const t: ToastInput = typeof input === "string" ? { title: input } : input;
      const id = ++seq.current;
      const tone = t.tone ?? "info";
      setItems((xs) => [...xs.slice(-3), { id, title: t.title, description: t.description, tone }]);
      window.setTimeout(() => dismiss(id), t.duration ?? (tone === "error" ? 6000 : 3500));
    },
    [dismiss],
  );

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed right-3 bottom-3 left-3 z-[100] flex flex-col items-end gap-2 sm:left-auto"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className="pointer-events-auto flex w-full max-w-sm animate-rise items-start gap-2.5 rounded-lg border border-border-strong bg-surface p-3 shadow-lg"
          >
            <span
              className={cn(
                "mt-0.5",
                t.tone === "success" && "text-success",
                t.tone === "error" && "text-danger",
                t.tone === "info" && "text-info",
              )}
            >
              {t.tone === "success" ? <IconCheckCircle size={16} /> : t.tone === "error" ? <IconAlert size={16} /> : <IconInfo size={16} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg">{t.title}</p>
              {t.description ? <p className="mt-0.5 text-sm break-words text-fg-muted">{t.description}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="rounded p-0.5 text-fg-subtle hover:bg-surface-2 hover:text-fg"
              aria-label="Dismiss notification"
            >
              <IconX size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
