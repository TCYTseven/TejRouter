import { loadMethodology, METHODOLOGY_PATH } from "@/components/methodology/doc";
import { Blocks, Heading, Inlines } from "@/components/methodology/render";
import { Summary, SUMMARY_ID } from "@/components/methodology/summary";
import { MobileToc, Toc } from "@/components/methodology/toc";
import { formatDate } from "@/lib/client/format";
import { OG_IMAGE, REPO_URL, SITE_NAME, SITE_URL, pageMetadata } from "@/lib/seo";

const DESCRIPTION =
  "How TejRouter computes every number: task-level cluster bootstrap and BCa intervals, Wilson intervals, paired McNemar and permutation tests, Holm and Benjamini-Hochberg corrections, Bradley-Terry ratings, cost-quality frontiers and information-theoretic routing metrics.";

export const metadata = pageMetadata({
  title: "How it works",
  description: DESCRIPTION,
  path: "/methodology",
});

const ARTICLE_ID = "methodology-article";

export default async function MethodologyPage() {
  const doc = await loadMethodology();
  const sourceUrl = `${REPO_URL}/blob/main/${METHODOLOGY_PATH}`;

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

  const toc = [{ id: SUMMARY_ID, num: null, title: "In short", level: 2 as const }, ...doc.toc];

  return (
    <div id="top" className="scroll-mt-20 xl:grid xl:grid-cols-[minmax(0,68ch)_220px] xl:justify-center xl:gap-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <article id={ARTICLE_ID} className="mx-auto min-w-0 max-w-[68ch] xl:mx-0">
        <header className="pb-10">
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-fg">How it works</h1>
          <p className="mt-2 text-[15px] text-fg-muted">The methods behind every number TejRouter reports.</p>
        </header>

        <MobileToc entries={toc} />

        <div className="text-base leading-[1.7] text-fg/90">
          <Summary />

          <div className="mt-16">
            {doc.intro.map((b, i) =>
              b.type === "paragraph" && /^Notation:/.test(b.text) ? (
                <p key={i} className="my-4 text-[15px] text-fg-muted">
                  <Inlines text={b.text} />
                </p>
              ) : (
                <Blocks key={i} blocks={[b]} />
              ),
            )}
          </div>

          {doc.sections.map((s) => (
            <section key={s.heading.id} aria-labelledby={s.heading.id} className="mt-16">
              <Heading block={s.heading} />
              <div className="mt-4">
                <Blocks blocks={s.blocks} />
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 text-sm text-fg-muted">
          <span>Last updated {formatDate(doc.updatedAt.getTime())}</span>
          <span className="flex items-center gap-5">
            <a href="#top" className="hover:text-fg">
              Back to top
            </a>
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-fg">
              View source on GitHub
            </a>
          </span>
        </footer>
      </article>

      <aside className="hidden xl:block">
        <div className="sticky top-10">
          <Toc entries={toc} />
        </div>
      </aside>
    </div>
  );
}
