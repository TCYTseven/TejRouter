"use client";

import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { IconCheckCircle, IconRefresh, IconXCircle } from "@/components/ui/icons";
import { ProviderDot } from "@/components/ui/provider";
import { getProviderSpec } from "@/lib/providers/registry";

/**
 * An example result: one prompt, three routers, what each one did. When it
 * scrolls into view it plays out like a real comparison: the prompt types in,
 * each router's clock runs, and answers land in the order the routers finish.
 * The server renders the finished card, and so does reduced motion.
 */
const PROMPT = "A jacket costs $240 and is 15% off. What is the sale price?";

const RESULTS = [
  { id: "ramp", model: "gpt-4.1-mini", seconds: 1.2, cost: "$0.0004", correct: true, answer: "$204" },
  { id: "enclave", model: "claude-sonnet-4", seconds: 2.3, cost: "$0.0031", correct: true, answer: "$204" },
  { id: "openrouter", model: "llama-3.1-8b", seconds: 0.6, cost: "$0.0001", correct: false, answer: "$225" },
];

/** Milliseconds the prompt takes to type, and the pause before the routers start. */
const TYPE_MS = 900;
const SEND_MS = 250;
/** Each router's clock runs at this fraction of real time, so the card doesn't drag. */
const SPEED = 1.25;
const END_MS = TYPE_MS + SEND_MS + (Math.max(...RESULTS.map((r) => r.seconds)) * 1000) / SPEED;
const EASE = [0.25, 1, 0.5, 1] as const;

/**
 * Elapsed playback time in ms, or `null` for the finished card. The server and
 * reduced motion get the finished card; after hydration the card waits blank
 * at 0 until `start`, so it never shows its ending before it plays.
 */
function usePlayback(armed: boolean, start: boolean) {
  const [ms, setMs] = useState<number | null>(null);
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (!armed) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      if (!start) {
        setMs(0);
        return;
      }
      const t = now - t0;
      setMs(t >= END_MS ? null : t);
      if (t < END_MS) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [armed, start, run]);
  return { ms, replay: () => setRun((n) => n + 1) };
}

export function ComparisonCard() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduce = useReducedMotion();
  const { ms, replay } = usePlayback(!reduce, inView);

  const typed = ms === null ? PROMPT.length : Math.min(PROMPT.length, Math.floor((ms / TYPE_MS) * PROMPT.length));
  const routerMs = ms === null ? Infinity : Math.max(0, ms - TYPE_MS - SEND_MS);
  const sent = ms === null || ms >= TYPE_MS + SEND_MS;

  return (
    <figure ref={ref} className="rounded-xl border border-border bg-surface">
      <div className="flex items-start gap-3 border-b border-border px-5 py-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-fg-muted">Prompt</p>
          <p className="mt-1 text-[15px] text-fg">
            {PROMPT.slice(0, typed)}
            {typed < PROMPT.length ? (
              <span aria-hidden="true" className="ml-px inline-block h-[1.1em] w-px translate-y-[3px] animate-pulse bg-fg" />
            ) : null}
            <span className="sr-only">{PROMPT.slice(typed)}</span>
          </p>
        </div>
        {reduce ? null : (
          <button
            type="button"
            onClick={replay}
            disabled={ms !== null}
            className="-mr-2 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-0"
          >
            <IconRefresh size={14} aria-hidden="true" />
            Replay
          </button>
        )}
      </div>
      <ul className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {RESULTS.map((r) => {
          const spec = getProviderSpec(r.id);
          if (!spec) return null;
          const doneAt = (r.seconds * 1000) / SPEED;
          const done = routerMs >= doneAt;
          const clock = done ? r.seconds : (routerMs * SPEED) / 1000;
          return (
            <li key={r.id} className="flex min-w-0 flex-col gap-4 px-5 py-5 sm:px-6">
              <div className="flex items-center gap-2">
                <ProviderDot provider={spec} size={10} />
                <span className="truncate text-[15px] font-semibold text-fg">{spec.name}</span>
                {sent && !done ? (
                  <span className="ml-auto flex items-center gap-1 text-[13px] text-fg-muted" aria-hidden="true">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fg-muted" />
                    Routing
                  </span>
                ) : null}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-fg-muted">Model</dt>
                <dd className="min-w-0 truncate text-right">
                  <Landing show={done}>
                    <code className="font-mono text-[13px] text-fg">{r.model}</code>
                  </Landing>
                </dd>
                <dt className="text-fg-muted">Answer</dt>
                <dd className="num text-right text-fg">
                  <Landing show={done} delay={0.05}>
                    {r.answer}
                  </Landing>
                </dd>
                <dt className="text-fg-muted">Time</dt>
                <dd className={`num text-right ${done ? "text-fg" : "text-fg-muted"}`}>{sent ? `${clock.toFixed(1)} s` : "–"}</dd>
                <dt className="text-fg-muted">Cost</dt>
                <dd className="num text-right text-fg">
                  <Landing show={done} delay={0.1}>
                    {r.cost}
                  </Landing>
                </dd>
              </dl>
              <div className="h-5">
                <AnimatePresence initial={false}>
                  {done ? (
                    <motion.p
                      initial={{ opacity: 0, scale: 0.9, y: 4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ duration: 0.35, ease: EASE, delay: 0.15 }}
                      className={`flex origin-left items-center gap-1.5 text-sm font-medium ${r.correct ? "text-success" : "text-danger"}`}
                    >
                      {r.correct ? <IconCheckCircle size={16} aria-hidden="true" /> : <IconXCircle size={16} aria-hidden="true" />}
                      {r.correct ? "Correct" : "Wrong"}
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              </div>
            </li>
          );
        })}
      </ul>
      <figcaption className="sr-only">Example comparison of three routers answering the same prompt.</figcaption>
    </figure>
  );
}

/** A value that fades up when its router answers, holding its space until then. */
function Landing({ show, delay = 0, children }: { show: boolean; delay?: number; children: React.ReactNode }) {
  return (
    <motion.span
      className="inline-block"
      initial={false}
      animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
      transition={show ? { duration: 0.35, ease: EASE, delay } : { duration: 0 }}
    >
      {children}
    </motion.span>
  );
}
