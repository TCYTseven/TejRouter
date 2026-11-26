// Bundles cli/ into dist/tejrouter.mjs, the file behind the `tejrouter` command.
// Runs on `npm install` (the prepare script), so a clone or `npx github:TCYTseven/TejRouter` has it ready.
import { chmod } from "node:fs/promises";

let esbuild;
try {
  esbuild = await import("esbuild");
} catch {
  // Installed without dev dependencies: the web app still works, only the command is missing.
  console.warn("tejrouter: esbuild is not installed, so the command line tool was not built.");
  process.exit(0);
}

const outfile = "dist/tejrouter.mjs";
await esbuild.build({
  entryPoints: ["cli/index.ts"],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // The server modules import "server-only", which is empty under this condition (as in Next's server build).
  conditions: ["react-server"],
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "warning",
});
await chmod(outfile, 0o755);
