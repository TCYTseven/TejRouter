import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconFlask } from "@/components/ui/icons";

export default function RunNotFound() {
  return (
    <EmptyState
      icon={<IconFlask size={18} />}
      title="Run not found"
      description="There is no stored benchmark run with this id. It may have been deleted, or it was never saved."
      action={
        <>
          <ButtonLink href="/runs" size="sm">
            All runs
          </ButtonLink>
          <ButtonLink href="/benchmarks" size="sm" variant="ghost">
            Start a benchmark
          </ButtonLink>
        </>
      }
    />
  );
}
