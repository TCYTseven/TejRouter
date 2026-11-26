import { main } from "./main";

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
    process.exitCode = 1;
  },
);
