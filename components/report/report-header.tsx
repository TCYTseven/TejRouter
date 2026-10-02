"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { IconChevronDown } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate } from "@/lib/client/format";
import { downloadJson } from "@/lib/client/report";
import { useReportCtx } from "./section";

export function ReportHeader() {
  const { report } = useReportCtx();
  const m = report.meta;
  const reps = m.repsObserved.max;
  const meta = [
    formatDate(m.createdAt),
    `${m.nTasks.toLocaleString("en-US")} tasks`,
    `${m.nArms} router${m.nArms === 1 ? "" : "s"}`,
    reps > 1 ? `ran each task ${m.repsObserved.min === reps ? reps : `${m.repsObserved.min}–${reps}`} times` : "ran each task once",
  ].join(" · ");
  return (
    <PageHeader
      back={{ label: "Results", href: "/runs" }}
      title={<span className="break-words">{m.name || m.runId}</span>}
      description={<span className="num">{meta}</span>}
      actions={<DownloadMenu />}
      className="pb-0"
    />
  );
}

function DownloadMenu() {
  const { report, run } = useReportCtx();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const safeName = (report.meta.name || report.meta.runId).replace(/[^\w.-]+/g, "-").slice(0, 60);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = [
    { key: "run", label: "Run data", hint: "Every answer, as JSON", act: () => downloadJson(`${safeName}.run.json`, run) },
    { key: "report", label: "Report", hint: "All statistics, as JSON", act: () => downloadJson(`${safeName}.report.json`, report) },
  ];
  return (
    <div ref={ref} className="relative">
      <Button size="md" variant="secondary" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} rightIcon={<IconChevronDown size={14} />}>
        Download
      </Button>
      {open ? (
        <div role="menu" aria-label="Download" className="absolute right-0 z-40 mt-1.5 w-60 rounded-lg border border-border bg-surface p-1 shadow-lg max-sm:left-0 max-sm:right-auto">
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              className="flex w-full flex-col items-start rounded-md px-3 py-2 text-left hover:bg-surface-2 focus-visible:bg-surface-2"
              onClick={() => {
                it.act();
                setOpen(false);
              }}
            >
              <span className="text-sm font-medium text-fg">{it.label}</span>
              <span className="text-[13px] text-fg-muted">{it.hint}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
