"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/client/cn";
import { IconCheck, IconChevronDown } from "./icons";
import { Spinner } from "./button";

/**
 * Free-text combobox with a filtered suggestion list (ARIA 1.2 combobox).
 * Typing any value is allowed; suggestions are a convenience.
 */
export function Combobox({
  id: idProp,
  value,
  onChange,
  options,
  placeholder,
  loading,
  emptyText = "No matches. Press Enter to use the typed value.",
  label,
  className,
  footer,
  onOpen,
  maxItems = 200,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  loading?: boolean;
  emptyText?: string;
  /** Accessible label when no visible <label htmlFor> exists. */
  label?: string;
  className?: string;
  footer?: ReactNode;
  /** Called when the list opens (lazy-load options here). */
  onOpen?: () => void;
  maxItems?: number;
}) {
  const auto = useId();
  const id = idProp ?? auto;
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = (query ?? "").trim().toLowerCase();
  const filtered = useMemo(() => {
    const list = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    return list.slice(0, maxItems);
  }, [options, q, maxItems]);

  const openList = () => {
    if (!open) {
      setOpen(true);
      setActive(0);
      onOpen?.();
    }
  };
  const commit = (v: string) => {
    onChange(v);
    setQuery(null);
    setOpen(false);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      openList();
      setActive((a) => Math.min(a + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open) {
        e.preventDefault();
        if (filtered[active] && query !== null && filtered.length) commit(filtered[active]);
        else commit(query ?? value);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        setQuery(null);
      }
    }
  };

  return (
    <div className={cn("relative", className)}>
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={label}
        aria-activedescendant={open && filtered[active] ? `${id}-opt-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        value={query ?? value}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          openList();
        }}
        onFocus={openList}
        onBlur={() => {
          // Commit typed text on blur, after option mousedown has run.
          window.setTimeout(() => {
            setOpen(false);
            setQuery((qq) => {
              if (qq !== null) onChange(qq.trim());
              return null;
            });
          }, 120);
        }}
        onKeyDown={onKey}
        className="h-9 w-full rounded-lg border border-border bg-surface pr-8 pl-3 text-sm text-fg placeholder:text-fg-subtle hover:border-border-strong focus:border-link focus:ring-2 focus:ring-link/20 focus:outline-none"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Show suggestions"
        onMouseDown={(e) => {
          e.preventDefault();
          if (open) setOpen(false);
          else {
            openList();
            inputRef.current?.focus();
          }
        }}
        className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-fg-subtle hover:text-fg"
      >
        {loading ? <Spinner size={12} /> : <IconChevronDown size={14} />}
      </button>
      {open ? (
        <div className="absolute top-full right-0 left-0 z-40 mt-1 overflow-hidden rounded-md border border-border-strong bg-surface shadow-lg">
          <ul id={listId} role="listbox" className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-fg-muted" role="presentation">
                {loading ? "Loading models…" : emptyText}
              </li>
            ) : (
              filtered.map((o, i) => (
                <li
                  key={o}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={o === value}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(o);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm",
                    i === active ? "bg-surface-3 text-fg" : "text-fg-muted",
                  )}
                >
                  <span className="truncate">{o}</span>
                  {o === value ? <IconCheck size={12} className="text-accent-text" /> : null}
                </li>
              ))
            )}
          </ul>
          {footer ? <div className="border-t border-border px-3 py-2 text-[13px] text-fg-muted">{footer}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
