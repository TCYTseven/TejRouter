"use client";

import { useState } from "react";
import { cn } from "@/lib/client/cn";
import { Button, type ButtonSize, type ButtonVariant } from "./button";
import { IconCheck, IconCopy } from "./icons";
import { useToast } from "./toast";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Copies `text`, flips to a check for 1.5s and raises a toast. */
export function CopyButton({
  text,
  label = "Copy",
  toastTitle = "Copied to clipboard",
  variant = "ghost",
  size = "sm",
  iconOnly,
  className,
}: {
  text: string;
  label?: string;
  toastTitle?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  const toast = useToast();
  return (
    <Button
      variant={variant}
      size={iconOnly ? (size === "xs" || size === "sm" ? "icon-sm" : "icon") : size}
      className={cn(className)}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      onClick={async () => {
        const ok = await copyText(text);
        if (ok) {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
          toast({ title: toastTitle, tone: "success", duration: 2000 });
        } else toast({ title: "Copy failed", description: "Clipboard is not available here.", tone: "error" });
      }}
    >
      {done ? <IconCheck size={14} className="text-success" /> : <IconCopy size={14} />}
      {iconOnly ? null : done ? "Copied" : label}
    </Button>
  );
}
