import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/client/cn";
import { REPO_URL } from "@/lib/seo";
import { HeadingAnchor } from "./heading-anchor";
import { parseInline, plainText, type Block, type Inline } from "./markdown";
import { splitNumber } from "./split-number";

/**
 * React renderer for the block tree from ./markdown.ts. Server component: only
 * the copy buttons hydrate. Every string is rendered as a text node.
 */

const REPO_FILE = /^(?:lib|app|components|docs|test)\/[\w./-]+\.(?:ts|tsx|md)$/;

function safeHref(href: string): { kind: "hash" | "internal" | "external"; href: string } | null {
  if (href.startsWith("#")) return { kind: "hash", href };
  if (href.startsWith("/") && !href.startsWith("//")) return { kind: "internal", href };
  if (/^https?:\/\//i.test(href)) return { kind: "external", href };
  return null;
}

function renderInline(nodes: Inline[], key = ""): ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}${i}`;
    switch (n.t) {
      case "text":
        return <Fragment key={k}>{n.v}</Fragment>;
      case "code": {
        const code = (
          <code className="rounded-[5px] bg-surface-2 px-[0.25em] py-[0.1em] font-mono text-[max(13px,0.875em)] text-fg [overflow-wrap:anywhere]">
            {n.v}
          </code>
        );
        return REPO_FILE.test(n.v) ? (
          <a key={k} href={`${REPO_URL}/blob/main/${n.v}`} target="_blank" rel="noopener noreferrer" className="hover:[&>code]:text-link" title="View source on GitHub">
            {code}
          </a>
        ) : (
          <Fragment key={k}>{code}</Fragment>
        );
      }
      case "strong":
        return (
          <strong key={k} className="font-semibold text-fg">
            {renderInline(n.c, `${k}.`)}
          </strong>
        );
      case "em":
        return (
          <em key={k} className="italic">
            {renderInline(n.c, `${k}.`)}
          </em>
        );
      case "link": {
        const h = safeHref(n.href);
        const kids = renderInline(n.c, `${k}.`);
        if (!h) return <Fragment key={k}>{kids}</Fragment>;
        const cls = "text-link underline decoration-link/40 underline-offset-[3px] hover:decoration-current";
        if (h.kind === "external")
          return (
            <a key={k} href={h.href} target="_blank" rel="noopener noreferrer" className={cls}>
              {kids}
            </a>
          );
        if (h.kind === "internal")
          return (
            <Link key={k} href={h.href} className={cls}>
              {kids}
            </Link>
          );
        return (
          <a key={k} href={h.href} className={cls}>
            {kids}
          </a>
        );
      }
    }
  });
}

export function Inlines({ text }: { text: string }) {
  return <>{renderInline(parseInline(text))}</>;
}

export function Heading({ block }: { block: Extract<Block, { type: "heading" }> }) {
  const { num, title } = splitNumber(block.text);
  const label = plainText(block.text);
  const Tag = block.level <= 2 ? "h2" : block.level === 3 ? "h3" : "h4";
  return (
    <Tag
      id={block.id}
      className={cn(
        "group/h relative scroll-mt-20 font-semibold tracking-tight text-fg xl:scroll-mt-8",
        block.level <= 2 ? "text-xl leading-snug" : block.level === 3 ? "mt-10 mb-3 text-[17px]" : "mt-8 mb-2 text-base",
      )}
    >
      {num ? <span className="num mr-2 font-medium text-fg-muted">{num}</span> : null}
      <Inlines text={title} />
      <HeadingAnchor id={block.id} label={label} className="ml-1.5 align-middle" />
    </Tag>
  );
}

function Formula({ text }: { text: string }) {
  return (
    <figure className="group/f relative my-6 rounded-lg border border-border bg-surface-2/60">
      <figcaption className="sr-only">Formula</figcaption>
      <div className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover/f:opacity-100 focus-within:opacity-100">
        <CopyButton text={text} iconOnly size="xs" label="Copy formula" toastTitle="Formula copied" />
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 font-mono text-[13.5px] leading-[1.7] text-fg">
        <code>{text}</code>
      </pre>
    </figure>
  );
}

function CodeBlock({ lang, text }: { lang: string; text: string }) {
  return (
    <figure className="group/f relative my-6 rounded-lg border border-border bg-surface-2/60">
      <figcaption className="sr-only">{lang} code</figcaption>
      <div className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover/f:opacity-100 focus-within:opacity-100">
        <CopyButton text={text} iconOnly size="xs" label="Copy code" />
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 font-mono text-[13.5px] leading-[1.7] text-fg">
        <code>{text}</code>
      </pre>
    </figure>
  );
}

const alignClass = { left: "text-left", center: "text-center", right: "text-right" } as const;

function Table({ block }: { block: Extract<Block, { type: "table" }> }) {
  return (
    <div className="my-6 overflow-x-auto rounded-lg border border-border">
      <table className={cn("w-full border-collapse text-sm leading-relaxed", block.head.length >= 3 ? "min-w-[560px]" : "min-w-[360px]")}>
        <thead>
          <tr className="bg-surface-2/60">
            {block.head.map((h, i) => (
              <th
                key={i}
                scope="col"
                className={cn("px-3.5 py-2.5 text-left text-[13px] font-medium whitespace-nowrap text-fg-muted", block.align[i] && alignClass[block.align[i]!])}
              >
                <Inlines text={h} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((r, ri) => (
            <tr key={ri} className="border-t border-border">
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className={cn(
                    "px-3.5 py-2.5 align-top",
                    ci === 0 ? "font-medium text-fg" : "text-fg/85",
                    ci === 0 && r.length > 2 && "min-w-[9rem]",
                    ci === 0 && c.length <= 34 && "whitespace-nowrap",
                    block.align[ci] && alignClass[block.align[ci]!],
                  )}
                >
                  <Inlines text={c} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListItem({ blocks }: { blocks: Block[] }) {
  const [first, ...rest] = blocks;
  if (first?.type === "paragraph")
    return (
      <li className="pl-1">
        <Inlines text={first.text} />
        {rest.length ? <Blocks blocks={rest} nested /> : null}
      </li>
    );
  return (
    <li className="pl-1">
      <Blocks blocks={blocks} nested />
    </li>
  );
}

export function Blocks({ blocks, nested }: { blocks: Block[]; nested?: boolean }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading":
            return <Heading key={i} block={b} />;
          case "paragraph":
            return (
              <p key={i} className={cn(nested ? "mt-2" : "my-5")}>
                <Inlines text={b.text} />
              </p>
            );
          case "list": {
            const cls = cn(
              nested ? "mt-2 space-y-1.5" : "my-5 space-y-2",
              "pl-5 marker:text-fg-subtle",
              b.ordered ? "list-decimal" : "list-disc",
            );
            const items = b.items.map((it, k) => <ListItem key={k} blocks={it} />);
            return b.ordered ? (
              <ol key={i} start={b.start} className={cls}>
                {items}
              </ol>
            ) : (
              <ul key={i} className={cls}>
                {items}
              </ul>
            );
          }
          case "code":
            return !b.lang || b.lang === "math" || b.lang === "text" ? (
              <Formula key={i} text={b.text} />
            ) : (
              <CodeBlock key={i} lang={b.lang} text={b.text} />
            );
          case "table":
            return <Table key={i} block={b} />;
          case "blockquote":
            return (
              <blockquote key={i} className="my-5 border-l-2 border-border-strong pl-4 text-fg-muted">
                <Blocks blocks={b.children} nested />
              </blockquote>
            );
          case "hr":
            return <hr key={i} className="my-10 border-border" />;
        }
      })}
    </>
  );
}
