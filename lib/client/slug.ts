/**
 * Heading slugs shared by the methodology page (which renders docs/METHODOLOGY.md
 * with these ids) and every "How is this computed?" link in the run report.
 *
 *   slugify("14.5 Escalation curve and adaptivity coefficient")
 *     === "145-escalation-curve-and-adaptivity-coefficient"
 *
 * Rule: lowercase, strip every character except a-z, 0-9, spaces and hyphens,
 * trim, then turn each run of whitespace into a single hyphen.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 -]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** Link to a methodology section by its heading text (without the leading #'s). */
export function methodologyHref(heading: string): string {
  return `/methodology#${slugify(heading)}`;
}
