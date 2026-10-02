import Link from "next/link";
import { IntroCard } from "@/components/methodology/intro-card";
import { loadMethodology, METHODOLOGY_PATH } from "@/components/methodology/doc";
import { plainText } from "@/components/methodology/markdown";
import { Blocks, Heading, Inlines } from "@/components/methodology/render";
import { MobileToc, Toc } from "@/components/methodology/toc";
import { IconArrowUpRight, IconBook, IconChevronRight, IconClock, IconFile, IconSigma } from "@/components/ui/icons";
import { formatDate } from "@/lib/client/format";
import { OG_IMAGE, REPO_URL, SITE_NAME, SITE_URL, pageMetadata } from "@/lib/seo";

const DESCRIPTION =
  "How TejRouter computes every number: task-level cluster bootstrap and BCa intervals, Wilson intervals, paired McNemar and permutation tests, Holm and Benjamini-Hochberg corrections, Bradley-Terry ratings, cost-quality frontiers and information-theoretic routing metrics.";

export const metadata = pageMetadata({
  title: "Methodology",
  description: DESCRIPTION,
  path: "/methodology",
});

const ARTICLE_ID = "methodology-article";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default async function MethodologyPage() {
  const doc = await loadMethodology();
  const sourceUrl = `${REPO_URL}/blob/main/${METHODOLOGY_PATH}`;
  const [lead, ...restIntro] = doc.intro;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: doc.title,
    description: DESCRIPTION,
    url: `${SITE_URL}/methodology`,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_URL}/methodology` },
    image: `${SITE_URL}${OG_IMAGE.url}`,
    inLanguage: "en",
    dateModified: doc.updatedAt.toISOString(),
    wordCount: doc.words,
    timeRequired: `PT${doc.minutes}M`,
    proficiencyLevel: "Expert",
    articleSection: doc.toc.filter((e) => e.level === 2).map((e) => e.title),
    about: ["LLM routing", "LLM evaluation", "Bootstrap confidence intervals", "Bradley-Terry model", "Multiple comparisons"],
    author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
  };

  return (
    <div id="top" className="scroll-mt-20 xl:grid xl:grid-cols-[minmax(0,800px)_244px] xl:justify-center xl:gap-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <article id={ARTICLE_ID} className="mx-auto min-w-0 max-w-[800px] xl:mx-0">
        <header className="pb-6">
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1 font-mono text-[11px] text-fg-subtle">
              <li>
                <Link href="/" className="rounded hover:text-fg">
                  TejRouter
                </Link>
              </li>
              <li className="flex items-center gap-1">
                <IconChevronRight size={10} className="opacity-60" />
                <span aria-current="page" className="text-fg-muted">
                  Methodology
                </span>
              </li>
            </ol>
          </nav>
          <h1 className="mt-4 flex items-center gap-3 text-[1.75rem] leading-tight font-semibold tracking-tight text-fg sm:text-[2.125rem]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-accent-text">
              <IconBook size={18} />
            </span>
            {doc.title}
          </h1>
          {lead?.type === "paragraph" ? (
            <p className="mt-4 text-base leading-relaxed text-fg-muted sm:text-[17px]">
              <Inlines text={lead.text} />
            </p>
          ) : null}
          <ul className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-fg-subtle">
            <li className="flex items-center gap-1.5">
              <IconClock size={13} />
              <span>
                <span className="text-fg-muted">{doc.minutes} min read</span> · {doc.words.toLocaleString("en-US")} words
              </span>
            </li>
            <li className="flex items-center gap-1.5">
              <IconFile size={13} />
              {doc.sections.length} sections
            </li>
            <li className="flex items-center gap-1.5">
              <IconSigma size={13} />
              {doc.formulas} formulas
            </li>
            <li>Updated {formatDate(doc.updatedAt.getTime())}</li>
            <li>
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-fg-muted hover:text-fg">
                Source <IconArrowUpRight size={12} />
              </a>
            </li>
          </ul>
        </header>

        <MobileToc entries={doc.toc} articleId={ARTICLE_ID} />

        <IntroCard />

        <div className="text-[15px] leading-[1.75] text-fg/85">
          {restIntro.map((b, i) =>
            b.type === "paragraph" && /^Notation:/.test(b.text) ? (
              <aside key={i} aria-label="Notation" className="mt-6 rounded-lg border border-border bg-surface-2/60 px-4 py-3 text-[13.5px] leading-relaxed text-fg-muted">
                <p className="eyebrow mb-1">Notation</p>
                <Inlines text={capitalize(b.text.replace(/^Notation:\s*/, ""))} />
              </aside>
            ) : (
              <Blocks key={i} blocks={[b]} />
            ),
          )}

          {doc.sections.map((s) => (
            <section key={s.heading.id} aria-labelledby={s.heading.id} className="mt-14 border-t border-border pt-10 first-of-type:mt-12">
              <Heading block={s.heading} />
              <div className="mt-5">
                <Blocks blocks={s.blocks} />
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 text-xs text-fg-subtle">
          <span>
            {plainText(doc.title)} · rendered from <code className="font-mono">{METHODOLOGY_PATH}</code>
          </span>
          <span className="flex items-center gap-4">
            <a href="#top" className="hover:text-fg">
              ↑ Back to top
            </a>
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-fg">
              View on GitHub <IconArrowUpRight size={12} />
            </a>
          </span>
        </footer>
      </article>

      <aside className="hidden xl:block">
        <div className="sticky top-8">
          <Toc entries={doc.toc} articleId={ARTICLE_ID} sourceUrl={sourceUrl} />
        </div>
      </aside>
    </div>
  );
}
