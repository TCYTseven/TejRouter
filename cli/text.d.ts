// Bundled as text by scripts/build-cli.mjs (and by vitest.config.ts in tests).
declare module "*.jsonl" {
  const text: string;
  export default text;
}
