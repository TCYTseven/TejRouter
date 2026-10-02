"use client";

import { useState } from "react";
import { copyText } from "@/components/ui/copy-button";
import { IconCheck, IconHash } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/client/cn";

/** "Copy link to section" button shown beside a heading. */
export function HeadingAnchor({ id, label, className }: { id: string; label: string; className?: string }) {
  const [done, setDone] = useState(false);
  const toast = useToast();
  return (
    <button
      type="button"
      aria-label={`Copy link to section: ${label}`}
      title="Copy link to this section"
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-[opacity,color,background-color] hover:bg-surface-2 hover:text-fg",
        "opacity-60 focus-visible:opacity-100 md:opacity-0 md:group-hover/h:opacity-100",
        done && "opacity-100 md:opacity-100",
        className,
      )}
      onClick={async () => {
        const url = `${window.location.origin}${window.location.pathname}#${id}`;
        window.history.replaceState(null, "", `#${id}`);
        const ok = await copyText(url);
        if (ok) {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
          toast({ title: "Link copied", description: `#${id}`, tone: "success", duration: 2000 });
        } else toast({ title: "Copy failed", description: "Clipboard is not available here.", tone: "error" });
      }}
    >
      {done ? <IconCheck size={14} className="text-success" /> : <IconHash size={14} />}
    </button>
  );
}
