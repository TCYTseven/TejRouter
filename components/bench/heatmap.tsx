"use client";

import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { BenchArm, BenchTaskMeta } from "@/lib/bench/types";
import { cn } from "@/lib/client/cn";
import { formatMs, formatPercent, truncate } from "@/lib/client/format";
import { ArmKey } from "./arm-tiles";
import { cellKey, type CellLive } from "./live-stats";

type Row = { kind: "suite"; suiteId: string; name: string; count: number } | { kind: "task"; task: BenchTaskMeta; r: number };

/** Sequential single-hue ramp (accent), light to strong; pending cells are hollow. */
export function scoreFill(score: number): string {
  const pct = Math.round(14 + 86 * Math.max(0, Math.min(1, score)));
  return `color-mix(in oklab, var(--accent) ${pct}%, var(--surface-3))`;
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

export function ScoreLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-fg-muted" aria-label="Heatmap legend">
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-3.5 rounded-[2px]" style={{ boxShadow: "inset 0 0 0 1px var(--border-strong)" }} />
        pending
      </span>
      <span className="flex items-center gap-1">
        score
        <span className="num text-fg-subtle">0</span>
        <span
          className="h-2.5 w-16 rounded-[2px]"
          style={{ background: `linear-gradient(to right, ${scoreFill(0)}, ${scoreFill(0.5)}, ${scoreFill(1)})` }}
        />
        <span className="num text-fg-subtle">1</span>
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-3.5 rounded-[2px] bg-surface-3" style={{ boxShadow: "inset 0 0 0 1.5px var(--danger)" }} />
        call failed
      </span>
    </div>
  );
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
  const cols = `minmax(84px, 168px) repeat(${arms.length}, minmax(26px, 72px))`;
  const minWidth = 84 + arms.length * 26;

  const describe = (): string => {
    if (!activeTask || !activeArm) return "";
    if (!activeCell) return `${activeTask.id}, ${activeArm.label}: pending.`;
    const mean = activeCell.scoreSum / activeCell.n;
    return `${activeTask.id}, ${activeArm.label}: score ${mean.toFixed(2)} over ${activeCell.n} repetition${activeCell.n === 1 ? "" : "s"}${activeCell.errors ? `, ${activeCell.errors} failed` : ""}.`;
  };

  return (
    <div ref={wrapRef} className="relative">
      <div
        ref={scrollRef}
        tabIndex={0}
        role="group"
        aria-label={`Task by arm score grid, ${taskRows.length} tasks by ${arms.length} arms. Use arrow keys to inspect cells.`}
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
          <div className="sticky top-0 left-0 z-20 border-b border-border bg-surface px-2 py-1.5 text-[10px] font-medium text-fg-subtle">
            task
          </div>
          {arms.map((a, c) => (
            <div
              key={a.id}
              className="sticky top-0 z-10 flex items-center justify-center border-b border-border bg-surface py-1.5"
              title={a.label}
            >
              <ArmKey arm={a} index={c} simulated={simulated(a.providerId)} />
            </div>
          ))}
          {rows.map((row) =>
            row.kind === "suite" ? (
              <div
                key={`s-${row.suiteId}`}
                className="sticky left-0 col-span-full flex items-baseline gap-2 border-b border-border bg-surface-2 px-2 pt-2 pb-1"
              >
                <span className="text-[11px] font-medium text-fg">{row.name}</span>
                <span className="num text-[10px] text-fg-subtle">{row.count} tasks · easy → hard</span>
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
          className="pointer-events-none absolute z-30 w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-full rounded-md border border-border-strong bg-surface px-2.5 py-2 text-[11px] leading-snug shadow-lg"
          style={{
            left: `clamp(8.5rem, ${active.x}px, calc(100% - 8.5rem))`,
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
      <div className="sticky left-0 z-[5] flex h-4 items-center gap-1.5 bg-surface px-2">
        <span
          className="h-1 shrink-0 rounded-full bg-fg-subtle/60"
          style={{ width: `${4 + task.difficulty * 18}px` }}
          title={`difficulty ${task.difficulty.toFixed(2)}`}
          aria-hidden="true"
        />
        <span className="truncate font-mono text-[9.5px] text-fg-subtle">{shortTaskId(task.id, task.suiteId)}</span>
      </div>
      {arms.map((a, c) => {
        const cell = cells.get(cellKey(task.id, a.id));
        return (
          <div key={a.id} className="flex h-4 items-center px-[1px]">
            <div
              data-r={r}
              data-c={c}
              className={cn(
                "h-3 w-full rounded-[2px] transition-[background-color] duration-200 hover:outline hover:outline-1 hover:outline-fg",
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
        <span className="num text-sm font-semibold text-fg">
          {mean == null ? "pending" : cell!.n > 1 ? formatPercent(mean, 0) : mean.toFixed(2)}
        </span>
        <span className="text-[10px] text-fg-subtle">
          {cell ? `${cell.n} rep${cell.n === 1 ? "" : "s"}${cell.n > 1 ? " mean" : " score"}` : ""}
        </span>
      </div>
      <div className="truncate font-mono text-[10.5px] text-fg">{task.id}</div>
      <div className="flex items-center gap-1.5 text-fg-muted">
        <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: arm.color }} />
        <span className="truncate">{arm.label}</span>
      </div>
      <div className="text-[10px] text-fg-subtle">
        {task.category} · difficulty {task.difficulty.toFixed(2)}
      </div>
      {s ? (
        <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 border-t border-border pt-1">
          <dt className="text-fg-subtle">served</dt>
          <dd className="truncate font-mono text-fg">{cell!.served.size ? [...cell!.served].join(", ") : (s.result.servedModel ?? "—")}</dd>
          <dt className="text-fg-subtle">latency</dt>
          <dd className="num text-fg">{formatMs(s.result.latencyMs)}</dd>
          <dt className="text-fg-subtle">answer</dt>
          <dd className="truncate font-mono text-fg">{s.grade.extracted != null ? truncate(s.grade.extracted, 60) : "—"}</dd>
          {s.result.ok ? null : (
            <>
              <dt className="text-danger">error</dt>
              <dd className="line-clamp-2 text-danger">{s.result.error ?? "request failed"}</dd>
            </>
          )}
        </dl>
      ) : null}
    </div>
  );
}
