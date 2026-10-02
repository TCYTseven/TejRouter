"use client";

import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/client/cn";

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Plain-text header for aria-sort announcements. */
  title?: string;
  align?: "left" | "right" | "center";
  render: (row: T) => ReactNode;
  /** Sort key; omit for an unsortable column. null sorts last. */
  sort?: (row: T) => number | string | null;
  className?: string;
  /** Hide below the sm breakpoint. */
  hideOnMobile?: boolean;
}

/**
 * Sortable, optionally paginated data table with tabular numerals. Used as the
 * accessible "table view" twin of every chart and as the sample explorer grid.
 */
export function DataTable<T>({
  rows,
  columns,
  getKey,
  caption,
  defaultSort,
  pageSize,
  onRowClick,
  rowLabel,
  minWidth = 520,
  selectedKey,
  page: pageProp,
  onPageChange,
}: {
  rows: T[];
  columns: Column<T>[];
  getKey: (row: T) => string;
  caption: string;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  pageSize?: number;
  onRowClick?: (row: T) => void;
  /** Accessible label for the row action. */
  rowLabel?: (row: T) => string;
  minWidth?: number;
  selectedKey?: string | null;
  page?: number;
  onPageChange?: (p: number) => void;
}) {
  const [sort, setSort] = useState(defaultSort ?? null);
  const [pageState, setPageState] = useState(0);
  const page = pageProp ?? pageState;
  const setPage = onPageChange ?? setPageState;

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const f = col.sort;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = f(a);
      const vb = f(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [rows, columns, sort]);

  const pages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const current = Math.min(page, pages - 1);
  const visible = pageSize ? sorted.slice(current * pageSize, current * pageSize + pageSize) : sorted;

  const toggle = (key: string) => {
    setSort((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
    setPage(0);
  };

  return (
    <div className="w-full">
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left text-xs" style={{ minWidth }}>
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-surface-2 text-[11px] text-fg-subtle">
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cn(
                      "px-3 py-2 font-medium whitespace-nowrap",
                      c.align === "right" && "text-right",
                      c.align === "center" && "text-center",
                      c.hideOnMobile && "hidden sm:table-cell",
                    )}
                  >
                    {c.sort ? (
                      <button
                        type="button"
                        onClick={() => toggle(c.key)}
                        className={cn("inline-flex items-center gap-1 rounded hover:text-fg", active && "text-fg")}
                      >
                        {c.header}
                        <span aria-hidden="true" className="text-[9px]">
                          {active ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const key = getKey(r);
              return (
                <tr
                  key={key}
                  className={cn(
                    "border-t border-border",
                    onRowClick && "cursor-pointer hover:bg-surface-2 focus-within:bg-surface-2",
                    selectedKey === key && "bg-accent-soft",
                  )}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                >
                  {columns.map((c, i) => (
                    <td
                      key={c.key}
                      className={cn(
                        "px-3 py-1.5 align-middle",
                        c.align === "right" && "num text-right",
                        c.align === "center" && "text-center",
                        c.hideOnMobile && "hidden sm:table-cell",
                        c.className,
                      )}
                    >
                      {i === 0 && onRowClick ? (
                        <button
                          type="button"
                          className="max-w-full rounded text-left outline-none hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                          aria-label={rowLabel?.(r)}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRowClick(r);
                          }}
                        >
                          {c.render(r)}
                        </button>
                      ) : (
                        c.render(r)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-fg-subtle">
                  No rows match.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {pageSize && pages > 1 ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-fg-muted">
          <span className="num">
            {current * pageSize + 1}–{Math.min(sorted.length, (current + 1) * pageSize)} of {sorted.length.toLocaleString("en-US")}
          </span>
          <div className="flex items-center gap-1">
            <PageButton disabled={current === 0} onClick={() => setPage(0)} label="First page">
              «
            </PageButton>
            <PageButton disabled={current === 0} onClick={() => setPage(current - 1)} label="Previous page">
              ‹
            </PageButton>
            <span className="num px-2">
              {current + 1} / {pages}
            </span>
            <PageButton disabled={current >= pages - 1} onClick={() => setPage(current + 1)} label="Next page">
              ›
            </PageButton>
            <PageButton disabled={current >= pages - 1} onClick={() => setPage(pages - 1)} label="Last page">
              »
            </PageButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PageButton({ children, disabled, onClick, label }: { children: ReactNode; disabled: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-border bg-surface-2 px-2 text-xs text-fg hover:border-border-strong disabled:opacity-40"
    >
      {children}
    </button>
  );
}
