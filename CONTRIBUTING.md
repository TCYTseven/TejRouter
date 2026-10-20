# Contributing to TejRouter

Thanks for helping out. TejRouter is a small codebase with a few firm rules, and this page lists them.

## Getting set up

You need Node 20.9 or newer (CI runs Node 22).

```bash
git clone https://github.com/TCYTseven/tejrouter
cd tejrouter
npm install
npm run dev        # http://localhost:3000
```

No keys are needed. Two offline practice routers (Practice: Budget and Practice: Smart) work out of the box, so you can exercise Compare, Benchmark, Results and Leaderboard without spending anything. Copy `.env.example` to `.env.local` when you want to test a real router.

## Before you open a pull request

CI runs these four, so run them locally first:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Then:

1. Branch from `main` and keep each pull request to one change.
2. Add or update tests next to the code you touched (`*.test.ts`, Vitest). Statistics, graders and suites all have tests; a new formula or grader needs one.
3. Attach screenshots for UI changes, in both the light and the dark theme.
4. Never commit an API key, a `.env*` file or anything under `data/` (saved runs).

Small fixes can go straight to a pull request. For a new router, a new suite or a change to how a number is computed, open an issue first so the approach can be agreed before you write it.

## Where things live

```
lib/providers/   router registry, server-side key lookup, streaming client, practice routers
lib/bench/       task suites, graders, runner, run storage
lib/stats/       dependency-free statistics (special functions, tests, bootstrap, ranking)
lib/analysis/    analyzeRun() -> RunReport, the weighted score, the leaderboard
lib/client/      browser-only code: saved keys, in-tab benchmarks, the relay fallback
app/api/         providers, chat, bench and runs routes (NDJSON streams)
app/(app)/       the app pages
components/      ui primitives, charts and one folder per page
docs/            METHODOLOGY.md, rendered at /methodology
```

## Adding a router

A router is one entry in [`lib/providers/registry.ts`](lib/providers/registry.ts): id, name, base URL, the environment variables its key may come from, its auto-routing model id if it has one, and a color for charts. Set `api: "responses"` if it only speaks the Responses API. Compare, Benchmark, the report and Settings pick the entry up without further changes. Add the matching variables to [`.env.example`](.env.example) and a row to the router table in the README.

## Adding tasks

Suites live in [`lib/bench/suites/`](lib/bench/suites) and are listed in `suites/index.ts`. Every task needs:

- a `difficulty` in [0, 1], so the report can tell whether a router escalates hard prompts;
- an answer a deterministic grader can check (exact, numeric, multiple choice, regex, JSON fields, instruction constraints, or code run against tests). There is no LLM judge in the main score;
- an answer you have verified. Computed answers are generated in code, and puzzles are checked by brute force in `suites.test.ts`.

## Statistics and the report

Every formula is documented in [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md), and the `/methodology` page renders that file. A change to how a number is computed changes the code, its test and that document in the same pull request. Tasks, not samples, are the unit of analysis, and every headline number carries an interval.

## Design rules

The interface is a calm product UI in the style of Linear, Vercel and Stripe's dashboard. The data is the interesting part.

- **One job per screen.** Each page answers one question: the answer first, in plain words, then the evidence. Advanced detail goes behind a tab, a "Show details" disclosure or a link.
- **Plain language.** Say "router", "model", "accuracy", "cost per answer". Statistical names (McNemar, BCa, ICC) appear only in the advanced view or in a tooltip that explains them.
- **No decoration.** No grid or dot backgrounds, glows, gradients, fake "live" dots, uppercase letter-spaced labels or icon tiles beside headings. Headings carry no icons.
- **Type.** Geist Sans everywhere; Geist Mono only for code, env var names, commands and model ids. Nothing smaller than 13px, charts included. Numbers use the `.num` class for tabular figures. Sentence case.
- **Color.** Neutral grays plus one blue (`text-link`) for links and focus. Router colors from the registry are for data only, never for chrome. Status colors always come with a word.
- **Layout.** App pages use a `max-w-5xl` column (`max-w-6xl` for the report and leaderboard), `space-y-10` between sections, cards `rounded-xl border bg-surface p-6`, no cards inside cards, at most three columns.
- **Navigation.** Six sidebar items in this order: Compare, Benchmark, Results, Leaderboard, Routers, Settings. Methodology sits in the sidebar footer.
- **States.** Empty states are one sentence and one action. Loading uses skeletons shaped like the content. Errors say what happened and what to do.
- **Charts.** One chart per question, sorted bars or dots with intervals over anything fancier, direct labels over legends, and a one-sentence takeaway above each chart.
- **Copy.** Lead with the answer ("Enclave was the most accurate: 84% vs 71% for Ramp"). Write "13 points", not "pp". No em dashes in UI text.

Use the primitives in `components/ui` rather than restyling them.

## Security

Keys stay where they were put: `.env.local` keys are read only on the server, and keys saved in Settings stay in the browser and go straight to the router. If you find a way for a key to leak, report it privately through [GitHub security advisories](https://github.com/TCYTseven/tejrouter/security/advisories/new), not in a public issue.

## License

By contributing you agree that your work is released under the [MIT License](LICENSE).
