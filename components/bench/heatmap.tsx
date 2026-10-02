"use client";

import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { BenchArm, BenchTaskMeta } from "@/lib/bench/types";
import { cn } from "@/lib/client/cn";
import { formatMs, formatPercent, truncate } from "@/lib/client/format";
import { ProviderDot } from "@/components/ui/provider";
import { armName } from "./config";
import { cellKey, type CellLive } from "./live-stats";

type Row = { kind: "suite"; suiteId: string; name: string; count: number } | { kind: "task"; task: BenchTaskMeta; r: number };

/** Sequential single-hue ramp (link blue), light to strong; pending cells are hollow. */
export function scoreFill(score: number): string {
  const pct = Math.round(14 + 86 * Math.max(0, Math.min(1, score)));
  return `color-mix(in oklab, var(--link) ${pct}%, var(--surface-3))`;
}

function cellStyle(cell: CellLive | undefined): CSSProperties {
  if (!cell) return { boxShadow: "inset 0 0 0 1px var(--border)" };
  const mean = cell.scoreSum / cell.n;
  return {
    background: scoreFill(mean),
    ...(cell.errors ? { boxShadow: "inset 0 0 0 1.5px var(--danger)" } : {}),
  };
}

function shortTaskId(id: string, suiteId: string): string {
  return id.startsWith(`${suiteId}/`) ? id.slice(suiteId.length + 1) : id;
}

/**
 * Live task × arm grid. Rows are tasks grouped by suite (sorted easy to hard within a suite),
 * columns are arms. Cell color is the mean score over completed repetitions. Hover or focus
 * (arrow keys) shows the task, served model, latency and extracted answer.
 */
export function Heatmap({
  tasks,
  arms,
  cells,
  suiteNames,
  simulated,
}: {
  tasks: BenchTaskMeta[];
  arms: BenchArm[];
  cells: Map<string, CellLive>;
  suiteNames: Record<string, string>;
  simulated: (providerId: string) => boolean;
}) {
  const rows = useMemo(() => {
    const out: Row[] = [];
    const bySuite = new Map<string, BenchTaskMeta[]>();
    for (const t of tasks) {
      const list = bySuite.get(t.suiteId) ?? [];
      list.push(t);
      bySuite.set(t.suiteId, list);
    }
    let r = 0;
    for (const [suiteId, list] of bySuite) {
      out.push({ kind: "suite", suiteId, name: suiteNames[suiteId] ?? suiteId, count: list.length });
      for (const task of [...list].sort((a, b) => a.difficulty - b.difficulty)) out.push({ kind: "task", task, r: r++ });
    }
    return out;
  }, [tasks, suiteNames]);
  const taskRows = useMemo(() => rows.filter((x): x is Extract<Row, { kind: "task" }> => x.kind === "task"), [rows]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ r: number; c: number; x: number; y: number } | null>(null);
  const [cursor, setCursor] = useState<{ r: number; c: number } | null>(null);
  const [focused, setFocused] = useState(false);

  const place = (el: Element, r: number, c: number) => {
    const wrap = wrapRef.current?.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    if (!wrap) return null;
    return { r, c, x: b.left - wrap.left + b.width / 2, y: b.top - wrap.top };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-c]");
    if (!el) return setHover(null);
    const r = Number(el.dataset.r);
    const c = Number(el.dataset.c);
    if (hover && hover.r === r && hover.c === c) return;
    setHover(place(el, r, c));
  };

  const moveCursor = (r: number, c: number) => {
    const rr = Math.max(0, Math.min(taskRows.length - 1, r));
    const cc = Math.max(0, Math.min(arms.length - 1, c));
    setCursor({ r: rr, c: cc });
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-r="${rr}"][data-c="${cc}"]`);
    if (el) {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      setHover(place(el, rr, cc));
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = cursor ?? { r: 0, c: 0 };
    const map: Record<string, [number, number]> = {
      ArrowDown: [1, 0],
      ArrowUp: [-1, 0],
      ArrowRight: [0, 1],
      ArrowLeft: [0, -1],
      PageDown: [10, 0],
      PageUp: [-10, 0],
    };
    if (e.key === "Home") {
      e.preventDefault();
      moveCursor(0, 0);
    } else if (e.key === "End") {
      e.preventDefault();
      moveCursor(taskRows.length - 1, arms.length - 1);
    } else if (map[e.key]) {
      e.preventDefault();
      moveCursor(cur.r + map[e.key][0], cur.c + map[e.key][1]);
    } else if (e.key === "Escape") {
      setHover(null);
    }
  };

  const active = hover ?? null;
  const activeTask = active ? taskRows[active.r]?.task : undefined;
  const activeArm = active ? arms[active.c] : undefined;
  const activeCell = activeTask && activeArm ? cells.get(cellKey(activeTask.id, activeArm.id)) : undefined;
  const cols = `minmax(120px, 220px) repeat(${arms.length}, minmax(64px, 120px))`;
  const minWidth = 120 + arms.length * 64;

  const describe = (): string => {
    if (!activeTask || !activeArm) return "";
    if (!activeCell) return `${activeTask.id}, ${armName(activeArm)}: pending.`;
    const mean = activeCell.scoreSum / activeCell.n;
    return `${activeTask.id}, ${armName(activeArm)}: score ${mean.toFixed(2)} over ${activeCell.n} repetition${activeCell.n === 1 ? "" : "s"}${activeCell.errors ? `, ${activeCell.errors} failed` : ""}.`;
  };

  return (
    <div ref={wrapRef} className="relative">
      <div
        ref={scrollRef}
        tabIndex={0}
        role="group"
        aria-label={`Score for every task and router, ${taskRows.length} tasks by ${arms.length} routers. Use arrow keys to inspect squares.`}
        onPointerMove={onPointerMove}
        onPointerLeave={() => !focused && setHover(null)}
        onKeyDown={onKeyDown}
        onScroll={() => !focused && hover && setHover(null)}
        onFocus={() => {
          setFocused(true);
          if (!cursor && taskRows.length) moveCursor(0, 0);
        }}
        onBlur={() => {
          setFocused(false);
          setHover(null);
        }}
        className="max-h-[26rem] overflow-auto overscroll-contain rounded-md border border-border bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 sm:max-h-[32rem]"
      >
        <div className="grid w-full" style={{ gridTemplateColumns: cols, minWidth }}>
          <div className="sticky top-0 left-0 z-20 border-b border-border bg-surface px-3 py-2 text-[13px] text-fg-muted">Task</div>
          {arms.map((a) => (
            <div
              key={a.id}
              className="sticky top-0 z-10 flex min-w-0 items-center justify-center gap-1.5 border-b border-border bg-surface px-1 py-2"
              title={a.label}
            >
              <ProviderDot color={a.color} simulated={simulated(a.providerId)} />
              <span className="truncate text-[13px] text-fg-muted">{armName(a)}</span>
            </div>
          ))}
          {rows.map((row) =>
            row.kind === "suite" ? (
              <div
                key={`s-${row.suiteId}`}
                className="sticky left-0 col-span-full flex items-baseline gap-2 border-b border-border bg-surface-2 px-3 py-1.5"
              >
                <span className="text-[13px] font-medium text-fg">{row.name}</span>
                <span className="num text-[13px] text-fg-muted">{row.count} tasks, easiest first</span>
              </div>
            ) : (
              <HeatRow
                key={row.task.id}
                task={row.task}
                r={row.r}
                arms={arms}
                cells={cells}
                cursor={focused && cursor?.r === row.r ? cursor.c : null}
              />
            ),
          )}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {focused ? describe() : ""}
      </p>

      {active && activeTask && activeArm ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-30 w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[13px] leading-snug shadow-lg"
          style={{
            left: `clamp(9.5rem, ${active.x}px, calc(100% - 9.5rem))`,
            top: active.y - 6,
          }}
        >
          <CellDetail task={activeTask} arm={activeArm} cell={activeCell} />
        </div>
      ) : null}
    </div>
  );
}

function HeatRow({
  task,
  r,
  arms,
  cells,
  cursor,
}: {
  task: BenchTaskMeta;
  r: number;
  arms: BenchArm[];
  cells: Map<string, CellLive>;
  cursor: number | null;
}) {
  return (
    <>
      <div className="sticky left-0 z-[5] flex h-7 items-center bg-surface px-3">
        <span className="truncate text-[13px] text-fg-muted">{shortTaskId(task.id, task.suiteId)}</span>
      </div>
      {arms.map((a, c) => {
        const cell = cells.get(cellKey(task.id, a.id));
        return (
          <div key={a.id} className="flex h-7 items-center px-0.5">
            <div
              data-r={r}
              data-c={c}
              className={cn(
                "h-5 w-full rounded-[3px] transition-[background-color] duration-200 hover:outline hover:outline-1 hover:outline-fg",
                cursor === c && "outline outline-2 outline-ring",
              )}
              style={cellStyle(cell)}
            />
          </div>
        );
      })}
    </>
  );
}

function CellDetail({ task, arm, cell }: { task: BenchTaskMeta; arm: BenchArm; cell: CellLive | undefined }) {
  const s = cell?.last;
  const mean = cell ? cell.scoreSum / cell.n : null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-medium text-fg">{shortTaskId(task.id, task.suiteId)}</span>
        <span className="num shrink-0 text-fg">{mean == null ? "Waiting" : `Score ${formatPercent(mean, 0)}`}</span>
      </div>
      <div className="flex items-center gap-1.5 text-fg-muted">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: arm.color }} />
        <span className="truncate">{armName(arm)}</span>
      </div>
      {s ? (
        <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 border-t border-border pt-1.5">
          <dt className="text-fg-muted">Model</dt>
          <dd className="truncate text-fg">{cell!.served.size ? [...cell!.served].join(", ") : (s.result.servedModel ?? "—")}</dd>
          <dt className="text-fg-muted">Time</dt>
          <dd className="num text-fg">{formatMs(s.result.latencyMs)}</dd>
          <dt className="text-fg-muted">Answer</dt>
          <dd className="truncate text-fg">{s.grade.extracted != null ? truncate(s.grade.extracted, 60) : "—"}</dd>
          {s.result.ok ? null : (
            <>
              <dt className="text-danger">Error</dt>
              <dd className="line-clamp-2 text-danger">{s.result.error ?? "Request failed"}</dd>
            </>
          )}
        </dl>
      ) : null}
    </div>
  );
}
