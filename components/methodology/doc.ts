import "server-only";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { countWords, parseMarkdown, plainText, type Block } from "./markdown";
import { splitNumber } from "./split-number";
import type { TocEntry } from "./toc";

export const METHODOLOGY_PATH = "docs/METHODOLOGY.md";

export interface MethodologySection {
  heading: Extract<Block, { type: "heading" }>;
  blocks: Block[];
}

export interface MethodologyDoc {
  title: string;
  intro: Block[];
  sections: MethodologySection[];
  toc: TocEntry[];
  words: number;
  minutes: number;
  formulas: number;
  updatedAt: Date;
}

const WPM = 200;

function countFormulas(blocks: Block[]): number {
  let n = 0;
  for (const b of blocks) {
    if (b.type === "code") n++;
    else if (b.type === "list") for (const it of b.items) n += countFormulas(it);
    else if (b.type === "blockquote") n += countFormulas(b.children);
  }
  return n;
}

/**
 * Reads docs/METHODOLOGY.md from the repository and splits it into intro and
 * numbered sections. The in-document "Contents" list is dropped: the page has
 * its own table of contents.
 */
export const loadMethodology = cache(async (): Promise<MethodologyDoc> => {
  const file = path.join(process.cwd(), METHODOLOGY_PATH);
  const [src, info] = await Promise.all([readFile(file, "utf8"), stat(file)]);
  const blocks = parseMarkdown(src);
  let title = "Methodology";
  const intro: Block[] = [];
  const sections: MethodologySection[] = [];
  let skipping = false;
  for (const b of blocks) {
    if (b.type === "heading" && b.level === 1) {
      title = plainText(b.text);
      continue;
    }
    if (b.type === "hr") continue;
    if (b.type === "heading" && b.level === 2) {
      skipping = b.id === "contents";
      if (!skipping) sections.push({ heading: b, blocks: [] });
      continue;
    }
    if (skipping) continue;
    if (sections.length) sections[sections.length - 1].blocks.push(b);
    else intro.push(b);
  }
  const toc: TocEntry[] = [];
  for (const s of sections) {
    const { num, title: t } = splitNumber(plainText(s.heading.text));
    toc.push({ id: s.heading.id, num, title: t, level: 2 });
    for (const b of s.blocks) {
      if (b.type === "heading" && b.level === 3) {
        const h = splitNumber(plainText(b.text));
        toc.push({ id: b.id, num: h.num, title: h.title, level: 3 });
      }
    }
  }
  const words = countWords(src);
  return {
    title,
    intro,
    sections,
    toc,
    words,
    minutes: Math.max(1, Math.round(words / WPM)),
    formulas: countFormulas(blocks),
    updatedAt: info.mtime,
  };
});
