import { IconCheckCircle, IconXCircle } from "@/components/ui/icons";
import { ProviderDot } from "@/components/ui/provider";
import { getProviderSpec } from "@/lib/providers/registry";

/** A static example result: one prompt, three routers, what each one did. */
const PROMPT = "A jacket costs $240 and is 15% off. What is the sale price?";

const RESULTS = [
  { id: "ramp", model: "gpt-4.1-mini", latency: "1.2 s", cost: "$0.0004", correct: true, answer: "$204" },
  { id: "enclave", model: "claude-sonnet-4", latency: "2.3 s", cost: "$0.0031", correct: true, answer: "$204" },
  { id: "openrouter", model: "llama-3.1-8b", latency: "0.6 s", cost: "$0.0001", correct: false, answer: "$225" },
];

export function ComparisonCard() {
  return (
    <figure className="rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <p className="text-[13px] text-fg-muted">Prompt</p>
        <p className="mt-1 text-[15px] text-fg">{PROMPT}</p>
      </div>
      <ul className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {RESULTS.map((r) => {
          const spec = getProviderSpec(r.id);
          if (!spec) return null;
          return (
            <li key={r.id} className="flex min-w-0 flex-col gap-4 px-5 py-5 sm:px-6">
              <div className="flex items-center gap-2">
                <ProviderDot provider={spec} size={10} />
                <span className="truncate text-[15px] font-semibold text-fg">{spec.name}</span>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-fg-muted">Model</dt>
                <dd className="min-w-0 truncate text-right">
                  <code className="font-mono text-[13px] text-fg">{r.model}</code>
                </dd>
                <dt className="text-fg-muted">Answer</dt>
                <dd className="num text-right text-fg">{r.answer}</dd>
                <dt className="text-fg-muted">Time</dt>
                <dd className="num text-right text-fg">{r.latency}</dd>
                <dt className="text-fg-muted">Cost</dt>
                <dd className="num text-right text-fg">{r.cost}</dd>
              </dl>
              {r.correct ? (
                <p className="flex items-center gap-1.5 text-sm font-medium text-success">
                  <IconCheckCircle size={16} aria-hidden="true" /> Correct
                </p>
              ) : (
                <p className="flex items-center gap-1.5 text-sm font-medium text-danger">
                  <IconXCircle size={16} aria-hidden="true" /> Wrong
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <figcaption className="sr-only">Example comparison of three routers answering the same prompt.</figcaption>
    </figure>
  );
}
