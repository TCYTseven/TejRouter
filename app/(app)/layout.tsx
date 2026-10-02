import { connection } from "next/server";
import { AppShell } from "@/components/shell/app-shell";
import { providerStatuses } from "@/lib/providers/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await connection();
  const providers = providerStatuses();
  const real = providers.filter((p) => !p.simulated);
  const status = {
    live: real.filter((p) => p.configured).length,
    total: real.length,
    simulators: providers.length - real.length,
  };
  return <AppShell status={status}>{children}</AppShell>;
}
