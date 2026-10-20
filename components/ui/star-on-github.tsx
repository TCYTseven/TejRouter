"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { IconGithub } from "./icons";

/**
 * "Star on GitHub" pill with a sparkle on hover. Ported from Amicro's btn-2
 * (https://amicro.dev/buttons, `pnpm dlx shadcn@latest add @amicro/btn-2`):
 * the GitHub mark drops out, a star rises in, and two small sparks pop beside it.
 */

const SPARK = "M12 2l2.4 7.6H22l-6.2 4.5 2.4 7.6-6.2-4.5-6.2 4.5 2.4-7.6L2 9.6h7.6z";
// Lucide "star" outline (ISC license).
const STAR =
  "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z";

export interface StarOnGithubProps {
  href: string;
  label?: string;
  className?: string;
}

export function StarOnGithub({ href, label = "Star on GitHub", className = "" }: StarOnGithubProps) {
  const [hovered, setHovered] = useState(false);
  const reduce = useReducedMotion();
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 600, damping: 25 };
  const pill = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 500, damping: 25 };
  const on = () => setHovered(true);
  const off = () => setHovered(false);

  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} (opens in a new tab)`}
      onMouseEnter={on}
      onMouseLeave={off}
      onFocus={on}
      onBlur={off}
      onTouchStart={on}
      onTouchEnd={() => setTimeout(off, 500)}
      initial={false}
      animate={{ paddingLeft: hovered ? 18 : 14, paddingRight: hovered ? 18 : 14 }}
      whileHover={reduce ? undefined : { scale: 1.02 }}
      whileTap={reduce ? undefined : { scale: 0.96 }}
      transition={pill}
      className={`relative inline-flex h-8 items-center justify-center rounded-full bg-fg/[0.05] text-fg transition-colors duration-150 hover:bg-fg/[0.08] ${className}`}
    >
      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden>
        <AnimatePresence mode="popLayout" initial={false}>
          {!hovered ? (
            <motion.span
              key="mark"
              initial={{ y: -15, opacity: 0, scale: 0.8 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -15, opacity: 0, scale: 0.8 }}
              transition={spring}
              className="absolute inset-0 flex items-center justify-center"
            >
              <IconGithub size={16} />
            </motion.span>
          ) : (
            <motion.span
              key="star"
              initial={{ y: 15, opacity: 0, scale: 0.8 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 15, opacity: 0, scale: 0.8 }}
              transition={spring}
              className="absolute inset-0 flex items-center justify-center"
            >
              <svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-yellow-400"
              >
                <path d={STAR} />
              </svg>
              <motion.span
                initial={{ opacity: 0, scale: 0, rotate: -45, y: 10 }}
                animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
                exit={{ opacity: 0, scale: 0, rotate: 45, y: 10 }}
                transition={{ ...spring, delay: reduce ? 0 : 0.05 }}
                className="absolute -right-2 -top-3"
              >
                <svg className="h-2.5 w-2.5 text-yellow-200" viewBox="0 0 24 24" fill="currentColor">
                  <path d={SPARK} />
                </svg>
              </motion.span>
              <motion.span
                initial={{ opacity: 0, scale: 0, rotate: 45, x: 10 }}
                animate={{ opacity: 1, scale: 1, rotate: 0, x: 0 }}
                exit={{ opacity: 0, scale: 0, rotate: -45, x: 10 }}
                transition={{ ...spring, delay: reduce ? 0 : 0.1 }}
                className="absolute -left-3 -top-1"
              >
                <svg className="h-1.5 w-1.5 text-yellow-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d={SPARK} />
                </svg>
              </motion.span>
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span className="ml-2.5 whitespace-nowrap text-[13px] font-medium tracking-tight">{label}</span>
    </motion.a>
  );
}
