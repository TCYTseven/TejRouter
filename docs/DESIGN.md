# TejRouter design spec

The interface is a calm product UI: Linear, Vercel and Stripe's dashboard are the
references. Readability comes first. The data is the interesting part; the chrome
should disappear.

## Principles

1. **One job per screen.** Each page answers one question. Put the answer at the
   top in plain words, then the evidence. Advanced detail lives behind a tab, a
   "Show details" disclosure or a link, never on the first screen.
2. **Plain language.** Say "router", "model", "accuracy", "cost per answer". Never
   show internal terms in the UI: no "arm", "pre-flight", "TejScore",
   "McNemar", "BCa", "AIQ", "ICC", "rep" in headings or labels. Statistical
   names may appear only inside an explicitly advanced view or a tooltip that
   explains them.
3. **Fewer things.** If removing an element loses nothing a user needs to decide
   or act, remove it. No decorative stats ("0 accounts needed"), no duplicate
   CTAs, no badges that restate the obvious.
4. **No decoration.** No grid or dot backgrounds, glows, gradients, terminal
   window chrome, fake "live" dots, uppercase letter-spaced labels or icon tiles
   next to headings.

## Type

Geist Sans for everything. Geist Mono only for code blocks, env var names,
shell commands and model ids inside tables. Numbers use the sans face with
tabular figures (the `.num` class does this).

| Role | Size / weight | Tailwind |
| --- | --- | --- |
| Page title (h1) | 28px / 600, tracking-tight | `text-[28px] font-semibold tracking-tight` |
| Section title (h2) | 18px / 600 | `text-lg font-semibold` |
| Card / group title (h3) | 15px / 600 | `text-[15px] font-semibold` |
| Body | 15px / 400, line-height 1.6 | `text-[15px]` (body default) |
| Secondary text | 14px, `text-fg-muted` | `text-sm text-fg-muted` |
| Smallest allowed (captions, table meta, axis ticks) | 13px | `text-[13px]` |
| Big numbers (headline metrics) | 28–32px / 600, tabular | `text-3xl font-semibold num` |

Nothing smaller than 13px anywhere, including charts. Sentence case everywhere.

## Color

Neutral grays plus one blue for interactive emphasis. Router colors come from
`lib/providers/registry.ts` and are used only for data (chart marks, a small
swatch next to a router name), never for chrome.

- Primary button: inverted (`variant="primary"`: near-white on dark, near-black on light).
- Links and focus rings: `--link` blue (`text-link`).
- Status colors (success, warning, danger) only for status, always with a word.
- Text: `text-fg` for content, `text-fg-muted` for secondary. `text-fg-subtle` only for placeholders and disabled.

## Layout and spacing

- App pages: content column `max-w-5xl` (1024px), centered, `px-6` (`px-4` on phones), `py-10`.
- Report and leaderboard may use `max-w-6xl`.
- Vertical rhythm: 40px between page sections (`space-y-10`), 16–24px inside cards.
- Cards: `rounded-xl border bg-surface`, padding `p-6` (`p-5` on phones). Do not nest cards inside cards; use a divider or a plain heading instead.
- Grids: at most 3 columns of cards; 2 is usually better.
- A page header is an h1 plus at most one sentence of description and at most two actions. No breadcrumbs except on detail pages (a single "← Results" back link).

## Navigation

Sidebar with six items, in this order:

| Label | Route | Question it answers |
| --- | --- | --- |
| Compare | `/playground` | "How do these routers answer my prompt?" |
| Benchmark | `/benchmarks` | "Which router is best across many graded tasks?" |
| Results | `/runs` (and `/runs/[id]`) | "What did my benchmarks find?" |
| Leaderboard | `/arena` | "Which router do I prefer in blind votes?" |
| Routers | `/providers` | "Which routers are connected, and how do I add one?" |
| Settings | `/settings` | "Where do I put my API keys?" (saved in this browser only) |

Methodology is linked from the sidebar footer and from report sections, not a
primary item. `/dashboard` redirects to `/playground`. The landing page `/` is
the only marketing page.

## Components

Use `components/ui`. Restyled primitives already follow this spec; don't
override their typography with smaller sizes.

- Empty states: one sentence saying what goes here, one primary action.
- Loading: skeletons the shape of the content.
- Errors: say what happened and what to do, in one sentence.
- Tooltips explain jargon; they never hold information needed to act.

## Charts

Follow the `dataviz` skill. On top of it:

- At most one chart per question. Prefer a sorted bar or dot-with-interval over anything fancier.
- Axis ticks and labels 13px, `text-fg-muted`. Direct labels instead of legends where possible.
- Every chart has a one-sentence takeaway above it, written from the data.

## Writing

- Lead with the answer: "Enclave was the most accurate: 84% vs 71% for Ramp."
- Numbers: "84%", "$0.0021 per answer", "1.2 s". No "pp" outside advanced views; write "13 points".
- Uncertainty in plain words: "likely better", "no clear difference", with the
  interval available on hover or in the advanced view.
- No em dashes in UI copy.
