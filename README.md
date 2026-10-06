# TejRouter

**The router that tests routers.** TejRouter sends the same prompts to every LLM router you use (Ramp Router, Enclave Cyberouter, OpenRouter, Requesty, FastLLM, Martian, or any OpenAI-compatible gateway) and measures what comes back: which model each router picked, how fast it answered, what it cost, whether the answer was right, and whether the differences are statistically real.

It runs locally. There are no accounts and no database. Keys go in one of two places: `.env.local` on the machine running the app (read by the server, never sent to the browser), or the Settings page, which stores them in your browser's local storage only. Two offline simulated routers work with zero keys, so you can try everything immediately.

## Quickstart

```bash
git clone https://github.com/TCYTseven/tejrouter
cd tejrouter
npm install
cp .env.example .env.local   # add whichever router keys you have (all optional)
npm run dev                  # http://localhost:3000
```

Then open `/onboarding` to connect your routers, or go straight to Compare.

## Pages

| Page | Route | What it does |
| --- | --- | --- |
| Home | `/` | What TejRouter is, with an example result |
| Compare | `/playground` | Send one prompt to several routers and read the answers side by side; vote for the best one |
| Benchmark | `/benchmarks` | Pick routers and a task set (Quick, Standard, Thorough) and watch the run fill in |
| Results | `/runs`, `/runs/[id]` | Saved runs, and a report that leads with a plain verdict, with routing, task-type and full statistics in tabs |
| Leaderboard | `/arena` | Rankings from your blind votes on Compare |
| Routers | `/providers` | Which routers are connected, how to add one, and a one-click test |
| Settings | `/settings` | API keys saved in this browser only |
| How it works | `/methodology` | Every metric and formula, rendered from [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) |
| Connect a router | `/onboarding` | Three-step setup, no account |

UI rules live in [`docs/DESIGN.md`](docs/DESIGN.md).

## Routers

Each router is one entry in [`lib/providers/registry.ts`](lib/providers/registry.ts). Keys are read server-side from these variables (first match wins):

| Router | Key | Base URL | Default model |
| --- | --- | --- | --- |
| Ramp Router | `RAMP_ROUTER_API_KEY` (also `RAMP_ROUTER_KEY`, `RAMP_API_KEY`, `ROUTER_API_KEY`) | `https://api.router.com/v1` | discovered from `/v1/models`, or `RAMP_ROUTER_MODEL` |
| Enclave Cyberouter | `ENCLAVE_ROUTER_API_KEY` (also `ENCLAVE_API_KEY`, `CYBEROUTER_API_KEY`, `CYBER_ROUTER_API_KEY`) | `https://router.enclave.ai/v1` | `cyberouter/auto` |
| OpenRouter | `OPENROUTER_API_KEY` | `https://openrouter.ai/api/v1` | `openrouter/auto` |
| Requesty | `REQUESTY_API_KEY` | `https://router.requesty.ai/v1` | set `REQUESTY_MODEL` to a routing policy |
| FastLLM | `FASTLLM_API_KEY` | self-hosted: set `FASTLLM_BASE_URL` | `FASTLLM_MODEL` |
| Martian | `MARTIAN_API_KEY` | `https://api.withmartian.com/v1` (unverified) | `MARTIAN_MODEL` |
| Custom | `CUSTOM_ROUTER_API_KEY` | `CUSTOM_ROUTER_BASE_URL` | `CUSTOM_ROUTER_MODEL` |
| Practice: Budget, Practice: Smart | none | offline | `sim/auto` |

Every base URL and model can be overridden with the `*_BASE_URL` and `*_MODEL` variables in [`.env.example`](.env.example). Adding a router is one registry entry; the playground, benchmarks and reports pick it up automatically.

## Benchmarks

221 auto-graded tasks in eight suites: `trivial`, `knowledge`, `math`, `reasoning`, `code`, `instruction`, `extraction` and `long-context`. Every task has a difficulty in [0, 1] so the report can show whether a router escalates hard prompts to stronger models and keeps easy ones cheap. Grading is deterministic, with no LLM judge: exact and numeric matching, multiple choice, regex, JSON field checks, IFEval-style constraints, and JavaScript solutions executed against tests in a sandboxed `node:vm`. Math answers are generated and computed in code; puzzle answers are verified by brute force in the test suite.

The runner shuffles jobs with a seed, caps per-router concurrency so no router is favoured by rate limits, retries 429 and 5xx responses with backoff, streams results as NDJSON and saves each run to `data/runs/` (gitignored).

**Arms.** An arm is a router plus an optional pinned model. Add a couple of pinned models (a cheap one and a strong one, e.g. through OpenRouter) as baselines and the report also computes an oracle router and each router's regret against the best single model.

## The report

Every number comes with an interval, and tasks (not samples) are the unit of analysis. Highlights:

- **Accuracy** with cluster-bootstrap BCa intervals and Wilson intervals; errors count as wrong.
- **Pairwise tests** on shared tasks: McNemar (exact and mid-p), paired permutation, Wilcoxon signed-rank and Cliff's delta on latency, Bayesian P(A > B), Holm and Benjamini-Hochberg corrections.
- **Routing analysis**: served-model distribution by category and difficulty, entropy, mutual information between task category and chosen model, easy-vs-hard Jensen-Shannon divergence, and a Firth logistic escalation curve whose slope measures how adaptive the router is.
- **Routing quality**: oracle accuracy and cost, regret vs the best fixed model, headroom captured.
- **Cost vs quality**: Pareto frontier, convex hull and AIQ (after RouterBench, Hu et al. 2024).
- **Ratings**: Bradley-Terry Elo from per-task head-to-heads, with bootstrap intervals and win probabilities.
- **Power and reliability**: minimum detectable effect, tasks needed for a 5-point difference, ICC and self-consistency across repetitions.
- **TejScore**: a weighted 0–100 composite with adjustable weights. It ranks arms within one run only.

Formulas, assumptions and references are in [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md).

## Security

**Keys saved in Settings** live in the browser's localStorage (`tejrouter:browser-keys:v1`). Any call that uses one goes straight from the browser to the router: Compare, the router test and model lists call it with the same client the server uses ([`lib/providers/openai.ts`](lib/providers/openai.ts)), and a benchmark that includes such a router runs in the tab ([`lib/client/local-bench.ts`](lib/client/local-bench.ts)), grading code tasks in a Web Worker with networking removed. Only the finished results, which carry no keys, are posted to `/api/runs`. When a router refuses requests from web pages (CORS), the call is retried through `/api/relay` ([`app/api/relay/route.ts`](app/api/relay/route.ts)), which forwards it to the router and stores and logs nothing; later calls to that router in the same tab use the relay from the start. The relay only forwards `/chat/completions` and `/models` calls from this app's own pages, and in production only to public HTTPS hosts. Set `TEJROUTER_PASSWORD` on a public deployment so it is not an open relay.

The API routes spend credits on your `.env.local` keys. For local use nothing extra is needed. If the app is reachable by anyone else, set `TEJROUTER_PASSWORD` and every page and API call requires HTTP Basic auth (see [`proxy.ts`](proxy.ts)). Keys are only read on the server; the browser sees which variable supplied a key and its last four characters.

## Development

```bash
npm run dev        # dev server
npm test           # vitest: stats, analysis, graders, suites, runner, simulators
npm run typecheck  # next typegen + tsc
npm run lint
npm run build
```

Layout:

```
lib/providers/   registry, server-side key resolution, streaming client, simulators
lib/bench/       task suites, graders, runner, run storage
lib/stats/       dependency-free statistics (special functions, tests, bootstrap, ranking, information theory)
lib/analysis/    analyzeRun() -> RunReport, TejScore, arena leaderboard
app/api/         providers, chat (NDJSON), bench (NDJSON), runs
app/(marketing)/ landing page
app/(app)/       dashboard, playground, benchmarks, runs, arena, providers, methodology, onboarding
components/      ui primitives, charts, playground, report, shell
```

Built with Next.js 16, React 19 and Tailwind CSS 4. No runtime dependencies beyond those.
