"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

const EASE = [0.25, 1, 0.5, 1] as const;

const TAGS = { div: motion.div, li: motion.li, p: motion.p, h1: motion.h1 } as const;

/**
 * Fades its children up into place once, the first time they scroll into view
 * (or on load when `onLoad`). Server-rendered at opacity 0, so the landing page
 * carries a <noscript> rule that shows every `[data-reveal]` without JavaScript.
 */
export function Reveal({
  as = "div",
  delay = 0,
  onLoad = false,
  className,
  children,
}: {
  as?: keyof typeof TAGS;
  delay?: number;
  /** Animate on mount instead of on scroll (the hero, above the fold). */
  onLoad?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const Tag = TAGS[as];
  const hidden = { opacity: 0, y: reduce ? 0 : 14 };
  const shown = { opacity: 1, y: 0 };
  return (
    <Tag
      data-reveal=""
      className={className}
      initial={hidden}
      {...(onLoad ? { animate: shown } : { whileInView: shown, viewport: { once: true, margin: "-60px" } })}
      transition={{ duration: reduce ? 0.2 : 0.6, ease: EASE, delay: reduce ? 0 : delay }}
    >
      {children}
    </Tag>
  );
}
