/** Tiny window event bus for global UI commands (palette <-> pages). */

export type AppCommand =
  | { type: "open-palette" }
  | { type: "playground:run" }
  | { type: "playground:stop" }
  | { type: "playground:toggle-blind" }
  | { type: "playground:focus-prompt" };

const EVENT = "tejrouter:command";

export function dispatchCommand(cmd: AppCommand): void {
  window.dispatchEvent(new CustomEvent<AppCommand>(EVENT, { detail: cmd }));
}

export function onCommand(handler: (cmd: AppCommand) => void): () => void {
  const fn = (e: Event) => handler((e as CustomEvent<AppCommand>).detail);
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
