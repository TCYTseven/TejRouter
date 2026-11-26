import { existsSync, promises as fs } from "node:fs";
import { buildEnvTemplate } from "@/lib/client/env-template";
import { providerStatuses } from "@/lib/providers/server";
import starter from "../examples/prompts.jsonl";

export const TASKS_FILE = "prompts.jsonl";
export const ENV_FILE = ".env.local";

/** A starter tasks file with one task per kind of grading. */
export const STARTER_TASKS: string = starter;

/** A .env.local with a line for every router's key, all empty. */
export function envTemplate(): string {
  // The shared template opens with advice for the web app; the lines per router are what is wanted here.
  const routers = buildEnvTemplate(providerStatuses()).split("\n").slice(3).join("\n");
  return `# Keys for tejrouter. Fill in the routers you use and leave the rest empty.\n# Keep this file out of git.\n\n${routers}`;
}

/** Write the starter files that are missing. Returns what was written and what was left alone. */
export async function init(dir = "."): Promise<{ written: string[]; kept: string[] }> {
  const written: string[] = [];
  const kept: string[] = [];
  for (const [name, content] of [
    [TASKS_FILE, STARTER_TASKS],
    [ENV_FILE, envTemplate()],
  ]) {
    const file = `${dir}/${name}`;
    if (existsSync(file)) kept.push(name);
    else {
      await fs.writeFile(file, content, "utf8");
      written.push(name);
    }
  }
  return { written, kept };
}
