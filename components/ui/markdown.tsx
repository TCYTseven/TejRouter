import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/client/cn";
import { CopyButton } from "./copy-button";

/**
 * Safe, hand-rolled markdown-ish renderer for model output.
 * Builds React elements only (never innerHTML), so arbitrary model text cannot
 * inject markup. Supports fenced code (including an unterminated fence while
 * streaming), headings, lists, blockquotes, rules, paragraphs, and inline
 * `code`, **bold**, *italic*, ~~strike~~ and http(s) links.
 */

type Block =
  | { kind: "code"; lang: string; text: string; open: boolean }
  | { kind: "heading"; level: number; text: string }
  | { kind: "ul" | "ol"; items: string[]; start: number }
  | { kind: "quote"; text: string }
  | { kind: "hr" }
  | { kind: "p"; text: string };

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^\s*(```+|~~~+)\s*([\w.+#-]*)\s*$/.exec(line);
    if (fence) {
      const marker = fence[1];
      const buf: string[] = [];
      i++;
      let closed = false;
      while (i < lines.length) {
        if (lines[i].trim().startsWith(marker)) {
          closed = true;
          i++;
          break;
        }
        buf.push(lines[i]);
        i++;
      }
      blocks.push({ kind: "code", lang: fence[2] || "", text: buf.join("\n"), open: !closed });
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ kind: "heading", level: h[1].length, text: h[2].replace(/\s#+\s*$/, "") });
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push({ kind: "quote", text: buf.join("\n") });
      continue;
    }
    const ul = /^\s*[-*+]\s+(.*)$/;
    const ol = /^\s*(\d+)[.)]\s+(.*)$/;
    if (ul.test(line) || ol.test(line)) {
      const ordered = ol.test(line) && !ul.test(line);
      const start = ordered ? Number(ol.exec(line)![1]) : 1;
      const items: string[] = [];
      while (i < lines.length) {
        const l = lines[i];
        const m = ordered ? ol.exec(l) : ul.exec(l);
        if (m) {
          items.push(ordered ? m[2] : m[1]);
          i++;
        } else if (l.trim() && /^\s{2,}/.test(l) && items.length) {
          items[items.length - 1] += " " + l.trim();
          i++;
        } else break;
      }
      blocks.push({ kind: ordered ? "ol" : "ul", items, start });
      continue;
    }
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*(```|~~~|#{1,6}\s|>|[-*+]\s+|\d+[.)]\s+)/.test(lines[i])
    ) {
      buf.push(lines[i++]);
    }
    if (buf.length) blocks.push({ kind: "p", text: buf.join("\n") });
    else {
      // Defensive: never loop forever on an unexpected line.
      blocks.push({ kind: "p", text: lines[i++] });
    }
  }
  return blocks;
}

const INLINE = /(`+)([\s\S]*?[^`])\1(?!`)|\*\*([^*\n]+?)\*\*|__([^_\n]+?)__|~~([^~\n]+?)~~|\*([^*\s][^*\n]*?)\*|(?<![\w])_([^_\s][^_\n]*?)_(?![\w])|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

export function renderInline(text: string, keyPrefix = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(...withBreaks(text.slice(last, idx), `${keyPrefix}-t${k}`));
    const key = `${keyPrefix}-${k++}`;
    if (m[1]) out.push(<code key={key}>{m[2]}</code>);
    else if (m[3] || m[4]) out.push(<strong key={key}>{renderInline(m[3] || m[4], key)}</strong>);
    else if (m[5]) out.push(<del key={key}>{renderInline(m[5], key)}</del>);
    else if (m[6] || m[7]) out.push(<em key={key}>{renderInline(m[6] || m[7], key)}</em>);
    else if (m[8] && m[9])
      out.push(
        <a key={key} href={m[9]} target="_blank" rel="noopener noreferrer nofollow">
          {m[8]}
        </a>,
      );
    else if (m[10])
      out.push(
        <a key={key} href={m[10]} target="_blank" rel="noopener noreferrer nofollow">
          {m[10]}
        </a>,
      );
    last = idx + m[0].length;
  }
  if (last < text.length) out.push(...withBreaks(text.slice(last), `${keyPrefix}-end`));
  return out;
}

function withBreaks(s: string, key: string): ReactNode[] {
  const parts = s.split("\n");
  return parts.map((p, i) => (
    <Fragment key={`${key}-${i}`}>
      {i > 0 ? <br /> : null}
      {p}
    </Fragment>
  ));
}

export function CodeBlock({ code, lang, streaming }: { code: string; lang?: string; streaming?: boolean }) {
  return (
    <div className="group/code relative overflow-hidden rounded-md border border-border bg-bg-subtle">
      <div className="flex h-7 items-center justify-between border-b border-border px-2.5">
        <span className="text-[13px] text-fg-muted">{lang || "text"}</span>
        {streaming ? null : (
          <CopyButton text={code} iconOnly label="Copy code" size="xs" className="opacity-70 group-hover/code:opacity-100" />
        )}
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-fg">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function Markdown({ text, streaming, className }: { text: string; streaming?: boolean; className?: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className={cn("prose-output", className)}>
      {blocks.map((b, i) => {
        const key = `b${i}`;
        switch (b.kind) {
          case "code":
            return <CodeBlock key={key} code={b.text} lang={b.lang} streaming={streaming && b.open} />;
          case "heading": {
            // Model headings render as h3-h6 so they never compete with the page outline.
            const level = Math.min(6, b.level + 2);
            const Tag = `h${level}` as "h3" | "h4" | "h5" | "h6";
            const cls = b.level === 1 ? "text-base" : b.level === 2 ? "text-[15px]" : "text-sm";
            return (
              <Tag key={key} className={cls}>
                {renderInline(b.text, key)}
              </Tag>
            );
          }
          case "ul":
            return (
              <ul key={key}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, `${key}-${j}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key} start={b.start}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, `${key}-${j}`)}</li>
                ))}
              </ol>
            );
          case "quote":
            return <blockquote key={key}>{renderInline(b.text, key)}</blockquote>;
          case "hr":
            return <hr key={key} />;
          default:
            return <p key={key}>{renderInline(b.text, key)}</p>;
        }
      })}
    </div>
  );
}
