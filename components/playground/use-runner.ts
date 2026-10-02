"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";
import { makeArmId } from "@/lib/client/arena-votes";
import { clientFailure, isAbortError, streamChat } from "@/lib/client/chat";
import { LETTERS, type ArmConfig, type ArmRound, type GenSettings, type RepRun, type Round } from "./types";

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function patchRep(round: Round, armKey: string, rep: number, patch: Partial<RepRun>): Round {
  return {
    ...round,
    arms: round.arms.map((a) =>
      a.key !== armKey ? a : { ...a, reps: a.reps.map((r) => (r.rep === rep ? { ...r, ...patch } : r)) },
    ),
  };
}

/**
 * Runs one playground round: arms in parallel (one /api/chat fetch each),
 * repetitions sequential within an arm. Streaming text is buffered and
 * flushed once per animation frame to keep renders cheap.
 */
export function usePlaygroundRunner() {
  const [round, setRound] = useState<Round | null>(null);
  const ctlRef = useRef<AbortController | null>(null);
  const buffers = useRef(new Map<string, { armKey: string; rep: number; text: string }>());
  const frame = useRef<number | null>(null);

  const flush = useCallback(() => {
    frame.current = null;
    const pending = [...buffers.current.values()];
    buffers.current.clear();
    if (!pending.length) return;
    setRound((r) => {
      if (!r) return r;
      let next = r;
      for (const p of pending) next = patchRep(next, p.armKey, p.rep, { text: p.text, status: "streaming" });
      return next;
    });
  }, []);

  const schedule = useCallback(() => {
    if (frame.current == null) frame.current = requestAnimationFrame(flush);
  }, [flush]);

  useEffect(
    () => () => {
      ctlRef.current?.abort();
      if (frame.current != null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const start = useCallback(
    (input: { prompt: string; system: string; arms: ArmConfig[]; settings: GenSettings }) => {
      ctlRef.current?.abort();
      const ctl = new AbortController();
      ctlRef.current = ctl;
      buffers.current.clear();

      const ordered = input.settings.blind ? shuffle(input.arms) : input.arms;
      const arms: ArmRound[] = ordered.map((a, i) => ({
        key: a.key,
        armId: makeArmId(a.providerId, a.model),
        providerId: a.providerId,
        model: a.model,
        letter: LETTERS[i] ?? String(i + 1),
        reps: Array.from({ length: input.settings.repeat }, (_, rep) => ({
          rep,
          status: "pending" as const,
          text: "",
          result: null,
        })),
      }));
      const id = `round-${Date.now().toString(36)}`;
      const startedAt = Date.now();
      setRound({
        id,
        prompt: input.prompt,
        system: input.system,
        startedAt,
        finishedAt: null,
        settings: input.settings,
        arms,
        vote: null,
        aborted: false,
      });

      const messages: ChatMessage[] = [];
      if (input.system.trim()) messages.push({ role: "system", content: input.system });
      messages.push({ role: "user", content: input.prompt });

      const runArm = async (arm: ArmRound) => {
        for (let rep = 0; rep < input.settings.repeat; rep++) {
          if (ctl.signal.aborted) break;
          setRound((r) => (r && r.id === id ? patchRep(r, arm.key, rep, { status: "streaming" }) : r));
          const req = {
            providerId: arm.providerId,
            model: arm.model || undefined,
            messages,
            temperature: input.settings.temperature,
            maxTokens: input.settings.maxTokens,
            // No fixed seed: a fresh random seed per call, so repeats measure real variance
            // (simulators are deterministic for a given seed).
            seed: input.settings.seed == null ? Math.floor(Math.random() * 1_000_000_000) : input.settings.seed + rep,
          };
          try {
            const result = await streamChat(req, {
              signal: ctl.signal,
              onDelta: (_d, full) => {
                buffers.current.set(`${arm.key}:${rep}`, { armKey: arm.key, rep, text: full });
                schedule();
              },
            });
            buffers.current.delete(`${arm.key}:${rep}`);
            setRound((r) =>
              r && r.id === id
                ? patchRep(r, arm.key, rep, {
                    status: result.ok ? "done" : "error",
                    // Prefer the final text; keep streamed text if the router failed mid-stream.
                    text: result.text || r.arms.find((a) => a.key === arm.key)?.reps[rep]?.text || "",
                    result,
                  })
                : r,
            );
          } catch (e) {
            buffers.current.delete(`${arm.key}:${rep}`);
            if (isAbortError(e)) break;
            const result = clientFailure(req, String(e), Date.now());
            setRound((r) => (r && r.id === id ? patchRep(r, arm.key, rep, { status: "error", result }) : r));
          }
        }
      };

      Promise.all(arms.map(runArm)).then(() => {
        setRound((r) => {
          if (!r || r.id !== id) return r;
          const aborted = ctl.signal.aborted;
          return {
            ...r,
            finishedAt: Date.now(),
            aborted,
            arms: r.arms.map((a) => ({
              ...a,
              reps: a.reps.map((x) =>
                x.status === "pending" || x.status === "streaming" ? { ...x, status: "aborted" as const } : x,
              ),
            })),
          };
        });
        if (ctlRef.current === ctl) ctlRef.current = null;
      });
    },
    [schedule],
  );

  const stop = useCallback(() => {
    ctlRef.current?.abort();
  }, []);

  const setVote = useCallback((vote: Round["vote"]) => {
    setRound((r) => (r ? { ...r, vote } : r));
  }, []);

  const clear = useCallback(() => {
    ctlRef.current?.abort();
    setRound(null);
  }, []);

  const running = !!round && round.finishedAt == null;
  return { round, running, start, stop, setVote, clear };
}
