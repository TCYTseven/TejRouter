"use client";

import { useCallback, useState } from "react";

/**
 * Measures an element's content width with a ResizeObserver. Returns a callback
 * ref and the width (0 until measured, so charts can render a placeholder).
 */
export function useElementWidth<T extends HTMLElement = HTMLDivElement>(): [(el: T | null) => void, number] {
  const [width, setWidth] = useState(0);
  const ref = useCallback((el: T | null) => {
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);
  return [ref, width];
}
