<div align="center">

<img src=".github/assets/logo.svg" width="72" height="72" alt="TejRouter logo" />

# TejRouter

**The router that tests routers.**

Send the same prompts to every LLM router you use and see which model each one picked,<br />
how fast it answered, what it cost, whether it was right, and whether the differences are real.

[![CI](https://github.com/TCYTseven/TejRouter/actions/workflows/ci.yml/badge.svg)](https://github.com/TCYTseven/TejRouter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/TCYTseven/TejRouter?style=flat&logo=github)](https://github.com/TCYTseven/TejRouter/stargazers)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Quickstart](#quickstart) · [Commands](#commands) · [Your own prompts](#your-own-prompts) · [CI](#catch-a-router-getting-worse) · [Routers](#routers) · [Benchmarks](#benchmarks) · [Methodology](docs/METHODOLOGY.md) · [Contributing](CONTRIBUTING.md)

<a href="docs/tejrouter_trailer_v1.mp4">
  <img src=".github/assets/trailer.gif" width="880" alt="TejRouter trailer: one prompt sent to every router, a 221-task benchmark, cost per answer, regret, and a plain verdict backed by statistics" />
</a>

<sub><a href="docs/tejrouter_trailer_v1.mp4">Watch the full trailer with sound (MP4)</a></sub>

</div>

## Why

LLM routers (Ramp Router, Enclave Cyberouter, OpenRouter, Requesty, FastLLM, Martian, or any OpenAI-compatible gateway) all promise to send each prompt to the right model. TejRouter checks that promise on prompts with known answers, yours or the 249 built in, and tells you which router is more accurate, cheaper or faster, whether the difference is real, and whether a router got worse since the last time you checked.

- **One command.** `npm run bench` prints which router to use. No account, no database, no dashboard to click through.
- **Your own prompts.** Point it at a file of prompts and expected answers to test routers on your workload instead of a generic benchmark.
- **Runs in CI.** Compare each run with a saved baseline and fail the job when a router's accuracy drops.
- **Works with zero keys.** Two offline practice routers let you try everything immediately.
- **Deterministic grading.** No LLM judge in the score: exact and numeric matching, JSON field checks, regex, and code run against tests.
- **Real statistics.** Paired tests, bootstrap intervals, routing analysis and cost-quality frontiers, all documented in [METHODOLOGY.md](docs/METHODOLOGY.md).

## Quickstart

```bash
git clone https://github.com/TCYTseven/TejRouter
cd TejRouter
npm install
cp .env.example .env.local   # add whichever router keys you have (all optional)
npm run bench
```

With no keys, `npm run bench -- --preset standard --seed 1` compares the two practice routers on every built-in task, so you can see the output first:

```
249 tasks × 2 routers = 498 calls (seed 1)
Practice: Budget vs Practice: Smart, standard
249 tasks, 2 routers, 498 calls

Practice: Smart · sim/auto has the highest accuracy: 83.2% correct at $0.00186 per answer, but it is about the same as Practice: Budget · sim/auto: this run cannot separate them.
If cost matters, Practice: Budget · sim/auto gets 79.0% for 11× less per answer.

Router                       Accuracy  Likely range  Cost per answer  Typical time  Failed calls
Practice: Smart · sim/auto      83.2%        79–88%         $0.00186        801 ms            0%
Practice: Budget · sim/auto     79.0%        74–83%         $0.00017        468 ms            0%

Practice: Smart · sim/auto: Picks per task; uses sim/large for 49% of tasks (sim/small 51%, sim/large 49%)
Practice: Budget · sim/auto: Picks per task; uses sim/large for 7% of tasks (sim/small 93%, sim/large 7%)

Notes
- Each task ran once. Add --reps 3 to measure how consistent each router is.
- No model is pinned in this run. Add one, such as openrouter=openai/gpt-4o-mini, to see whether routing beats always using one model.

Run saved to data/runs/run-20261126-212928-mbbct4.json
```

"Clearly better" is only said when a paired test on the shared tasks supports it; otherwise the verdict says the run cannot separate the routers.

Without cloning, the same command runs straight from GitHub (the first run takes a while to install):

```bash
npx github:TCYTseven/TejRouter bench
```

It reads keys from `.env.local` in the directory you run it in, or from the environment. In a project of your own, `init` writes that file and a starter set of prompts:

```bash
npx github:TCYTseven/TejRouter init
npx github:TCYTseven/TejRouter bench --tasks prompts.jsonl
```

## Commands

`npm run bench -- <options>` in a clone, or `npx tejrouter bench <options>`.

```bash
# Compare two routers, and pin two models as baselines to see whether routing beats a single model
npm run bench -- --routers openrouter,requesty,openrouter=openai/gpt-4o-mini,openrouter=anthropic/claude-sonnet-4.5

# Only the hardest tasks, where routers actually differ
npm run bench -- --routers openrouter,enclave --preset hard

# Your own prompts (see below)
npm run bench -- --routers openrouter,requesty --tasks prompts.jsonl
```

| Command | What it does |
| --- | --- |
| `tejrouter init` | Write a starter `prompts.jsonl` and a `.env.local` with a line for every router's key; never overwrites a file |
| `tejrouter bench` | Run a benchmark and print which router to use |
| `tejrouter report [run]` | Print the report for a saved run (default: the latest) |
| `tejrouter compare <before> <now>` | Compare two saved runs of the same routers |
| `tejrouter failures [run]` | List the tasks each router got wrong, with the reply and why it was marked wrong |
| `tejrouter routers [--test]` | List routers and whether each has a key; `--test` sends one prompt to each |
| `tejrouter suites` | List the built-in task sets |
| `tejrouter runs` | List saved runs |

| Option | Meaning |
| --- | --- |
| `--routers a,b=model` | Routers to compare. `id=model` pins a model. Default: every router with a key |
| `--tasks file` | Your own prompts and expected answers |
| `--suites a,b` | Built-in task sets to run |
| `--preset name` | `quick` (10 tasks per set, the default), `standard` (all), `thorough` (all, three times), `hard` (only the hardest) |
| `--reps`, `--max-tasks`, `--seed`, `--concurrency`, `--max-tokens`, `--temperature`, `--name` | Run settings |
| `--baseline run` | Compare with an earlier run and fail on a clear accuracy drop |
| `--max-drop points` | Also fail when accuracy fell by more than this many points |
| `--max-cost-increase pct` | Also fail when cost per answer rose by more than this percentage |
| `--fail-under pct` | Fail when any router's accuracy is below this |
| `--md file` | Write the full report as Markdown (task types, head-to-head tests, changes since the baseline) |
| `--out file` | Write the run, with every call and answer, as JSON |
| `--json` | Print the summary as JSON instead of text |

`failures` lists first the tasks the other routers got right, which is where a router is losing to its competitors rather than to a hard prompt:

```
Practice: Budget · sim/auto got 3 of 16 tasks wrong
Task                    Others right  Model      Why                                               Reply
math/comb-derangements  1 of 1        sim/small  answer line: 1713 vs 1854                         Working through the combinatorics task on sim/small. Answer…
knowledge/sci-godel     0 of 1        sim/small  none of "Kurt Gödel", "Gödel", "Godel", "Goedel"  Working through the science task on sim/small. Answer: ledö…
math/ms-multiples-3-5   0 of 1        sim/small  answer line: 83843 vs 84903                       Working through the multi-step task on sim/small. Answer: 8…

Practice: Smart · sim/auto got 3 of 16 tasks wrong
Task                    Others right  Model      Why                                                           Reply
knowledge/geo-mongolia  1 of 1        sim/large  none of "Ulaanbaatar", "Ulan Bator", "Ulan-Bator", "Ulaanba…  Working through the geography task on sim/large. Answer: un…
knowledge/sci-godel     0 of 1        sim/small  none of "Kurt Gödel", "Gödel", "Godel", "Goedel"              Working through the science task on sim/small. Answer: ledö…
math/ms-multiples-3-5   0 of 1        sim/large  answer line: 89714 vs 84903                                   Working through the multi-step task on sim/large. Answer: 8…
```

A run is `latest`, an id from `tejrouter runs`, or a path to a run's JSON file. Exit codes: `0` done, `1` a check failed, `2` the command or its input was wrong.

## Your own prompts

A generic benchmark says little about your workload. Put your prompts and the answers you expect in a JSONL file, one task per line:

```jsonl
{"prompt": "What is the capital of France?", "expected": "Paris"}
{"prompt": "How many days do customers have to return an item?", "system": "Policy: returns within 30 days.", "expected": 30}
{"prompt": "Extract the name and age: Ana is 31.", "expected": {"name": "Ana", "age": 31}}
{"prompt": "Which plan fits a team of 40? A) Starter B) Team C) Enterprise", "expected": "B", "choices": ["A", "B", "C"]}
{"id": "iso-date", "prompt": "Write March 5 2024 as an ISO date.", "expected": "2024-03-05", "grader": "exact", "category": "formatting", "difficulty": 0.3}
```

[`examples/prompts.jsonl`](examples/prompts.jsonl) has one task for each kind of grading, and `tejrouter init` copies it into your project. How a reply is graded is picked from the answer: a number is compared numerically, an object field by field, `choices` makes it multiple choice, and any other text must appear in the reply. Set `grader` to `contains`, `exact`, `numeric`, `regex`, `choice` or `json` to choose, or to a full grader object from [`lib/bench/types.ts`](lib/bench/types.ts) (for example `{"kind": "code", ...}` to run a JavaScript function against tests). `messages` replaces `prompt` for multi-turn tasks, and `category` and `difficulty` (0 to 1) feed the by-task-type and routing analysis. A JSON array works too.

With `--tasks`, every task in the file runs once. Add `--suites` to run built-in sets alongside.

## Catch a router getting worse

Routers change what they serve without telling you. Save a baseline once, then compare against it on a schedule:

```bash
npm run bench -- --routers openrouter --tasks prompts.jsonl --out router-baseline.json
npm run bench -- --routers openrouter --tasks prompts.jsonl --baseline router-baseline.json
```

The second command exits with `1` when a router's accuracy fell and McNemar's test on the shared tasks says the drop is real (p < 0.05), and shows what else changed: the model it uses most, and the cost per answer. `--max-drop 5` also fails on any drop over five points, `--max-cost-increase 20` fails when the cost per answer rose by more than a fifth, and `--fail-under 80` sets a floor.

In GitHub Actions ([`examples/router-check.yml`](examples/router-check.yml)):

```yaml
- run: npx --yes github:TCYTseven/TejRouter bench --routers openrouter --tasks prompts.jsonl --baseline router-baseline.json --md report.md
  env:
    OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
- run: cat report.md >> "$GITHUB_STEP_SUMMARY"
  if: always()
```

## From a coding agent

Any agent that can run a shell command can use TejRouter; there is nothing to install into the agent. `--json` prints one JSON object on stdout (the verdict sentences, each router's accuracy with its interval, cost, latency and models served, head-to-head tests, the baseline comparison and whether the checks passed), progress goes to stderr, and the exit code says whether a check failed.

```bash
npx tejrouter bench --routers openrouter,requesty --tasks prompts.jsonl --json
```

## Web dashboard

The same runs open in a local dashboard with charts, per-sample answers and the full statistics. It is optional.

```bash
npm run dev   # http://localhost:3000
```

| Page | Route | What it does |
| --- | --- | --- |
| Compare | `/playground` | Send one prompt to several routers and read the answers side by side; vote for the best one |
| Benchmark | `/benchmarks` | Pick routers and a task set and watch the run fill in |
| Results | `/runs`, `/runs/[id]` | Saved runs (including ones from the command line), with routing, task-type and full statistics in tabs |
| Leaderboard | `/arena` | Rankings from your blind votes on Compare |
| Routers | `/providers` | Which routers are connected, how to add one, and a one-click test |
| Settings | `/settings` | API keys saved in this browser only |
| How it works | `/methodology` | Every metric and formula, rendered from [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) |
| Connect a router | `/onboarding` | Three-step setup, no account |

## Routers

Each router is one entry in [`lib/providers/registry.ts`](lib/providers/registry.ts). Keys are read server-side from these variables (first match wins):

| Router | Key | Base URL | Default model |
| --- | --- | --- | --- |
| Ramp Router | `RAMP_ROUTER_API_KEY` (also `RAMP_ROUTER_KEY`, `RAMP_API_KEY`, `ROUTER_API_KEY`) | `https://api.router.com/v1` (Responses API: it has no `/chat/completions`) | `gpt-5.6-sol`, or `RAMP_ROUTER_MODEL`. That is one fixed model, so Ramp does not route; set `switchyard`, `auto-jev-routing` or a routing profile's slug to test its routing |
| Enclave Cyberouter | `ENCLAVE_ROUTER_API_KEY` (also `ENCLAVE_API_KEY`, `CYBEROUTER_API_KEY`, `CYBER_ROUTER_API_KEY`) | `https://router.enclave.ai/v1` | `cyberouter/auto` |
| OpenRouter | `OPENROUTER_API_KEY` | `https://openrouter.ai/api/v1` | `openrouter/auto` |
| Requesty | `REQUESTY_API_KEY` | `https://router.requesty.ai/v1` | set `REQUESTY_MODEL` to a routing policy |
| FastLLM | `FASTLLM_API_KEY` | self-hosted: set `FASTLLM_BASE_URL` | `FASTLLM_MODEL` |
| Martian | `MARTIAN_API_KEY` | `https://api.withmartian.com/v1` (unverified) | `MARTIAN_MODEL` |
| Custom | `CUSTOM_ROUTER_API_KEY` | `CUSTOM_ROUTER_BASE_URL` | `CUSTOM_ROUTER_MODEL` |
| Practice: Budget, Practice: Smart | none | offline | `sim/auto` |

Every base URL and model can be overridden with the `*_BASE_URL` and `*_MODEL` variables in [`.env.example`](.env.example). Routers speak the OpenAI Chat Completions API unless their entry sets `api: "responses"`, in which case TejRouter calls `POST /responses` (the Responses API) and reads its streamed events; Ramp Router is one. Adding a router is one registry entry; the command line, the playground, benchmarks and reports pick it up automatically.

## Benchmarks

249 auto-graded tasks in nine suites: `trivial`, `knowledge`, `math`, `reasoning`, `code`, `instruction`, `extraction`, `long-context` and `hard` (exact big-number and calendar arithmetic, long chains of state changes, logic grids where every clue matters, aggregation over a long log, tricky code and writing under many rules at once). The **Hard** preset runs only tasks rated 0.6 or harder in each set: easy tasks every router gets right hide the differences, and they give a router no reason to pick a stronger model. Three more are off unless picked under Customize, and always run whole: `multilingual` (word problems in eight languages), `rephrase` (nine questions asked three ways each) and `edge` (empty and blank messages, noise, a 20,000-word prompt, prompt injection, harmless questions with alarming words). Every task has a difficulty in [0, 1] so the report can show whether a router escalates hard prompts to stronger models and keeps easy ones cheap. Grading is deterministic, with no LLM judge: exact and numeric matching, multiple choice, regex, JSON field checks, IFEval-style constraints, and JavaScript solutions executed against tests in a sandboxed `node:vm`. Math answers are generated and computed in code; puzzle answers are verified by brute force in the test suite.

The runner shuffles jobs with a seed, caps per-router concurrency so no router is favoured by rate limits, retries 429 and 5xx responses with backoff (recording each retried attempt), streams results as NDJSON and saves each run to `data/runs/` (gitignored).

**Arms.** An arm is a router plus an optional pinned model. Add a couple of pinned models (a cheap one and a strong one, e.g. through OpenRouter) as baselines and the report also computes an oracle router and each router's regret against the best single model.

## The report

The command line prints the verdict and `--md` writes the main tables; the dashboard's Results page shows everything below. Every number comes with an interval, and tasks (not samples) are the unit of analysis. Highlights:

- **Accuracy** with cluster-bootstrap BCa intervals and Wilson intervals; errors count as wrong.
- **Pairwise tests** on shared tasks: McNemar (exact and mid-p), paired permutation, Wilcoxon signed-rank and Cliff's delta on latency, Bayesian P(A > B), Holm and Benjamini-Hochberg corrections.
- **Routing analysis**: served-model distribution by category and difficulty, entropy, mutual information between task category and chosen model, easy-vs-hard Jensen-Shannon divergence, and a Firth logistic escalation curve whose slope measures how adaptive the router is.
- **Routing quality**: oracle accuracy and cost, regret vs the best fixed model, headroom captured, single models that beat the router on both accuracy and cost, and hindsight choices of the router's own models capped at its spend (one per task type, or one per task).
- **Cost vs quality**: Pareto frontier, convex hull and AIQ (after RouterBench, Hu et al. 2024).
- **Ratings**: Bradley-Terry Elo from per-task head-to-heads, with bootstrap intervals and win probabilities.
- **Power and reliability**: minimum detectable effect, tasks needed for a 5-point difference, ICC and self-consistency across repetitions.
- **TejScore**: a weighted 0–100 composite with adjustable weights. It ranks arms within one run only.
- **Advanced analysis** (a switch beside the report tabs, off by default): tail latency (p90/p95/p99, timeouts), router overhead against a direct call to the model it picked, failures, retries and failover, behaviour under concurrent load, JSON and code format compliance, instruction following by rule, unsupported answers on document tasks, an AI judge with a rubric checked against the grader and your own grades, cost spread and output-token inflation, cost per correct answer by difficulty, slices by input length, language and task set, edge cases, routing determinism across repeats and rephrasings, and drift against an earlier run.

Formulas, assumptions and references are in [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md).

## Security

**The command line** reads keys from `.env.local` or the environment and sends them only to the router they belong to. Runs are saved under `data/runs/` in the directory you run it in (set `TEJROUTER_RUNS_DIR` to move them); a saved run holds prompts and replies, never keys. Code tasks are graded in a `node:vm` context with no access to `process` or `require`.

**Keys saved in Settings** live in the browser's localStorage (`tejrouter:browser-keys:v1`). Any call that uses one goes straight from the browser to the router: Compare, the router test and model lists call it with the same client the server uses ([`lib/providers/openai.ts`](lib/providers/openai.ts)), and a benchmark that includes such a router runs in the tab ([`lib/client/local-bench.ts`](lib/client/local-bench.ts)), grading code tasks in a Web Worker with networking removed. Only the finished results, which carry no keys, are posted to `/api/runs`. When a router refuses requests from web pages (CORS), the call is retried through `/api/relay` ([`app/api/relay/route.ts`](app/api/relay/route.ts)), which forwards it to the router and stores and logs nothing; later calls to that router in the same tab use the relay from the start. The relay only forwards `/chat/completions`, `/responses` and `/models` calls from this app's own pages, and in production only to public HTTPS hosts. Set `TEJROUTER_PASSWORD` on a public deployment so it is not an open relay.

The API routes spend credits on your `.env.local` keys. For local use nothing extra is needed. If the app is reachable by anyone else, set `TEJROUTER_PASSWORD` and every page and API call requires HTTP Basic auth (see [`proxy.ts`](proxy.ts)). Keys are only read on the server; the browser sees which variable supplied a key and its last four characters.

## Development

```bash
npm run dev        # dev server
npm run cli -- --help   # build and run the command line tool
npm test           # vitest: stats, analysis, graders, suites, runner, practice routers, command line
npm run typecheck  # next typegen + tsc
npm run lint
npm run build
```

```
cli/             the tejrouter command: arguments, summary and checks, text and Markdown output
lib/providers/   registry, server-side key resolution, streaming client, practice routers
lib/bench/       task suites, your own tasks (custom.ts), graders, runner, run storage
lib/stats/       dependency-free statistics (special functions, tests, bootstrap, ranking, information theory)
lib/analysis/    analyzeRun() -> RunReport, TejScore, arena leaderboard
app/api/         providers, chat (NDJSON), bench (NDJSON), runs, relay
app/(marketing)/ landing page
app/(app)/       playground, benchmarks, runs, arena, providers, settings, methodology, onboarding
components/      ui primitives, charts, playground, report, shell
```

Built with Next.js 16, React 19, Tailwind CSS 4 and Motion.

## Contributing

Issues and pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) covers setup, adding a router or a task suite, the statistics rules and the design rules. Security problems go through [a private advisory](https://github.com/TCYTseven/TejRouter/security/advisories/new).

If TejRouter helped you pick a router, a star helps other people find it.

## License

[MIT](LICENSE) © Tejas Chakrapani
