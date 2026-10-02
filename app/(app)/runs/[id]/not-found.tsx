import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function RunNotFound() {
  return (
    <EmptyState
      title="Run not found"
      description="There is no saved benchmark with this id. It may have been deleted."
      action={
        <>
          <ButtonLink href="/runs" size="sm" variant="primary">
            All results
          </ButtonLink>
        </>
      }
    />
  );
}
