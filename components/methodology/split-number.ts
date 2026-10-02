/** Splits "14.5 Escalation curve" into its section number and title. */
export function splitNumber(text: string): { num: string | null; title: string } {
  const m = /^(\d+(?:\.\d+)*)\.?\s+(.*)$/.exec(text);
  return m ? { num: m[1], title: m[2] } : { num: null, title: text };
}
