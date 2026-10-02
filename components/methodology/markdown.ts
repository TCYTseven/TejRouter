import { slugify } from "@/lib/client/slug";

/**
 * A small, safe markdown parser for docs/METHODOLOGY.md. It produces a plain
 * block tree (no HTML strings); components/methodology/render.tsx turns it into
 * React elements, so nothing in the document can inject markup.
 *
 * Supported: ATX headings, paragraphs, nested ordered/unordered lists with
 * continuation blocks, fenced code (unlabelled fences are formulas), GFM tables
 * (with \| escapes), blockquotes and thematic breaks. Inline syntax is parsed
 * at render time by parseInline().
 */

export type Align = "left" | "center" | "right" | null;

export type Block =
  | { type: "heading"; level: number; text: string; id: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; start: number; items: Block[][] }
  | { type: "code"; lang: string; text: string }
  | { type: "table"; head: string[]; align: Align[]; rows: string[][] }
  | { type: "blockquote"; children: Block[] }
  | { type: "hr" };

const FENCE = /^(\s*)(`{3,}|~{3,})\s*([\w+.-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const LIST = /^(\s*)([-*+]|\d{1,9}[.)])(\s+)(.*)$/;
const QUOTE = /^\s{0,3}>\s?/;
const TABLE_SEP = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

const isBlank = (s: string | undefined) => s == null || !s.trim();
const indentOf = (s: string) => s.length - s.trimStart().length;

/** Heading text with inline markup removed, for ids and the table of contents. */
export function plainText(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\\([\\`*_{}[\]()#+\-.!|])/g, "$1")
    .trim();
}

/** Split a table row on unescaped pipes. Pipes inside `code spans` are kept literal. */
function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (ch === "`") {
      inCode = !inCode;
      cur += ch;
    } else if (ch === "|" && !inCode) {
      cells.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function parseAlign(sep: string): Align[] {
  return splitRow(sep).map((c) => {
    const l = c.startsWith(":");
    const r = c.endsWith(":");
    return l && r ? "center" : r ? "right" : l ? "left" : null;
  });
}

function startsBlock(line: string, next: string | undefined): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    HR.test(line) ||
    QUOTE.test(line) ||
    LIST.test(line) ||
    (line.includes("|") && next != null && TABLE_SEP.test(next))
  );
}

interface Ctx {
  ids: Map<string, number>;
}

function uniqueId(ctx: Ctx, text: string): string {
  const base = slugify(plainText(text)) || "section";
  const n = ctx.ids.get(base) ?? 0;
  ctx.ids.set(base, n + 1);
  return n ? `${base}-${n}` : base;
}

function parseLines(lines: string[], ctx: Ctx): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const ind = fence[1].length;
      const marker = fence[2];
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(marker)) {
        const l = lines[i];
        buf.push(indentOf(l) >= ind ? l.slice(ind) : l.trimStart());
        i++;
      }
      i++; // closing fence (or EOF)
      out.push({ type: "code", lang: fence[3] ?? "", text: buf.join("\n") });
      continue;
    }

    const h = HEADING.exec(line);
    if (h) {
      out.push({ type: "heading", level: h[1].length, text: h[2], id: uniqueId(ctx, h[2]) });
      i++;
      continue;
    }

    if (HR.test(line)) {
      out.push({ type: "hr" });
      i++;
      continue;
    }

    if (line.includes("|") && TABLE_SEP.test(lines[i + 1] ?? "")) {
      const head = splitRow(line);
      const align = parseAlign(lines[i + 1]);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && !isBlank(lines[i]) && lines[i].includes("|")) {
        const cells = splitRow(lines[i]);
        rows.push(head.map((_, k) => cells[k] ?? ""));
        i++;
      }
      out.push({ type: "table", head, align, rows });
      continue;
    }

    if (QUOTE.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && !isBlank(lines[i]) && (QUOTE.test(lines[i]) || !startsBlock(lines[i], lines[i + 1]))) {
        buf.push(lines[i].replace(QUOTE, ""));
        i++;
      }
      out.push({ type: "blockquote", children: parseLines(buf, ctx) });
      continue;
    }

    const li = LIST.exec(line);
    if (li) {
      const ind = li[1].length;
      const ordered = /\d/.test(li[2]);
      const start = ordered ? parseInt(li[2], 10) : 1;
      const items: Block[][] = [];
      while (i < lines.length) {
        const m = LIST.exec(lines[i]);
        if (!m || m[1].length !== ind || /\d/.test(m[2]) !== ordered) break;
        const contentCol = m[1].length + m[2].length + Math.min(4, m[3].length);
        const itemLines = [m[4]];
        i++;
        while (i < lines.length) {
          const l = lines[i];
          if (isBlank(l)) {
            let j = i;
            while (j < lines.length && isBlank(lines[j])) j++;
            if (j < lines.length && indentOf(lines[j]) >= contentCol) {
              for (; i < j; i++) itemLines.push("");
              continue;
            }
            break;
          }
          if (indentOf(l) >= contentCol) {
            itemLines.push(l.slice(contentCol));
            i++;
            continue;
          }
          // Lazy paragraph continuation: an unindented line that does not start a new block.
          const lastText = itemLines[itemLines.length - 1];
          if (!isBlank(lastText) && !startsBlock(l, lines[i + 1]) && !FENCE.test(lastText)) {
            itemLines.push(l.trim());
            i++;
            continue;
          }
          break;
        }
        items.push(parseLines(itemLines, ctx));
        // Loose lists: blank lines between items of the same list.
        let j = i;
        while (j < lines.length && isBlank(lines[j])) j++;
        const next = j < lines.length ? LIST.exec(lines[j]) : null;
        if (next && next[1].length === ind && /\d/.test(next[2]) === ordered) i = j;
        else break;
      }
      out.push({ type: "list", ordered, start, items });
      continue;
    }

    // Paragraph: consecutive lines until a blank line or another block starts.
    const buf = [line.trim()];
    i++;
    while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines[i], lines[i + 1])) {
      buf.push(lines[i].trim());
      i++;
    }
    out.push({ type: "paragraph", text: buf.join(" ") });
  }
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  return parseLines(lines, { ids: new Map() });
}

/* ---------------------------------------------------------------------------
 * Inline syntax
 * ------------------------------------------------------------------------- */

export type Inline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "link"; href: string; c: Inline[] };

const INLINE =
  /\\([\\`*_{}[\]()#+\-.!|<>])|(`+)([\s\S]*?[^`])\2(?!`)|\[([^\]]+)\]\(([^)\s]+)\)|\*\*(?=\S)([\s\S]*?\S)\*\*|(?<![\w*\\])\*(?=[^\s*])([\s\S]*?[^\s*])\*(?![\w*])/g;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  const push = (v: string) => {
    if (!v) return;
    const prev = out[out.length - 1];
    if (prev && prev.t === "text") prev.v += v;
    else out.push({ t: "text", v });
  };
  for (const m of src.matchAll(INLINE)) {
    const at = m.index ?? 0;
    push(src.slice(last, at));
    last = at + m[0].length;
    if (m[1] != null) push(m[1]);
    else if (m[2] != null) out.push({ t: "code", v: m[3].replace(/^ (.*) $/, "$1") });
    else if (m[4] != null) out.push({ t: "link", href: m[5], c: parseInline(m[4]) });
    else if (m[6] != null) out.push({ t: "strong", c: parseInline(m[6]) });
    else if (m[7] != null) out.push({ t: "em", c: parseInline(m[7]) });
  }
  push(src.slice(last));
  return out;
}

/** Words in the document, for the reading-time estimate. */
export function countWords(src: string): number {
  return src
    .replace(/[`*#|>[\]()-]/g, " ")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}
