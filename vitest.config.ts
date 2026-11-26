import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // cli/init.ts imports its starter tasks file as text, as the command line bundle does.
  plugins: [
    {
      name: "jsonl-as-text",
      load(id) {
        if (id.endsWith(".jsonl")) return `export default ${JSON.stringify(readFileSync(id, "utf8"))};`;
      },
    },
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: { include: ["**/*.test.ts"], exclude: ["node_modules/**", ".next/**"] },
});
