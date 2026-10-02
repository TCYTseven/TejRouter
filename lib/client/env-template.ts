import type { ProviderStatus } from "@/lib/types";

type EnvInfo = Pick<
  ProviderStatus,
  "id" | "name" | "keyEnvs" | "baseUrlEnv" | "modelEnv" | "baseUrl" | "simulated" | "autoModel" | "docsUrl"
>;

/** Every env var a provider reads, in the order the server checks them. */
export function providerEnvVars(p: EnvInfo): { name: string; role: "key" | "key-alias" | "base-url" | "model" }[] {
  const out: { name: string; role: "key" | "key-alias" | "base-url" | "model" }[] = [];
  p.keyEnvs.forEach((k, i) => out.push({ name: k, role: i === 0 ? "key" : "key-alias" }));
  if (p.baseUrlEnv) out.push({ name: p.baseUrlEnv, role: "base-url" });
  if (p.modelEnv) out.push({ name: p.modelEnv, role: "model" });
  return out;
}

/**
 * A copyable .env.local template covering every real router. Base URL lines are
 * commented out unless the router has no default (self-hosted / custom), in
 * which case they are required.
 */
export function buildEnvTemplate(providers: EnvInfo[]): string {
  const lines: string[] = [
    "# TejRouter: paste into .env.local, fill in your keys, then restart npm run dev.",
    "# Keys stay on the server. The browser only ever sees the last 4 characters.",
    "",
  ];
  for (const p of providers) {
    if (p.simulated || !p.keyEnvs.length) continue;
    lines.push(`# ${p.name}${p.docsUrl ? `  (${p.docsUrl})` : ""}`);
    const [primary, ...aliases] = p.keyEnvs;
    lines.push(`${primary}=`);
    if (aliases.length) lines.push(`#   also accepted instead: ${aliases.join(", ")}`);
    if (p.baseUrlEnv) {
      if (p.baseUrl) lines.push(`# ${p.baseUrlEnv}=${p.baseUrl}`);
      else lines.push(`${p.baseUrlEnv}=   # required: your deployment's /v1 URL`);
    }
    if (p.modelEnv) lines.push(`# ${p.modelEnv}=${p.autoModel ?? ""}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}
