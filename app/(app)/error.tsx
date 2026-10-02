"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { IconAlert, IconRefresh } from "@/components/ui/icons";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-danger/30 bg-danger-soft text-danger">
        <IconAlert size={22} />
      </div>
      <div>
        <h1 className="text-lg font-semibold text-fg">This view hit an error</h1>
        <p className="mt-1.5 text-sm text-fg-muted">
          Something failed while rendering this page. Your local data (votes, history, settings) is safe.
        </p>
      </div>
      <pre className="num max-w-full overflow-x-auto rounded-md border border-border bg-surface-2 px-3 py-2 text-left text-[11px] text-fg-muted">
        {error.message || "Unknown error"}
        {error.digest ? `\ndigest: ${error.digest}` : ""}
      </pre>
      <div className="flex gap-2">
        <Button variant="accent" onClick={() => retry()} leftIcon={<IconRefresh size={14} />}>
          Try again
        </Button>
        <ButtonLink href="/playground" variant="secondary">
          Go to Compare
        </ButtonLink>
      </div>
    </div>
  );
}
