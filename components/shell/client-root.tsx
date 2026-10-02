"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";
import { CommandPalette } from "./command-palette";

/** Client-side app chrome mounted once in the root layout. */
export function ClientRoot({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      {children}
      <CommandPalette />
    </ToastProvider>
  );
}
