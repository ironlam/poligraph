import type { PoliticianFactCheckLanding } from "@/lib/data/factcheck-politician";

/** Title, h1 and description of /factchecks/politique/[slug]: counts and names only. */

/**
 * The heading names what the page holds. Claims only (or nothing confirmed about them): the
 * historical wording. Both: the person first, then the two lists. Fact-checks about them only:
 * says so, so a reader never takes a rumour for the person's own words.
 */
export function heading(landing: Pick<PoliticianFactCheckLanding, "author" | "claimed" | "about">) {
  const { fullName } = landing.author;
  if (landing.about.length === 0) return `Les déclarations de ${fullName} vérifiées`;
  if (landing.claimed.length === 0) return `Les fact-checks au sujet de ${fullName}`;
  return `${fullName} : déclarations vérifiées et fact-checks à son sujet`;
}

function plural(n: number, one: string, many: string): string {
  if (n > 1) return `${n.toLocaleString("fr-FR")} ${many}`;
  return `${n.toLocaleString("fr-FR")} ${one}`;
}

/** Counts only, read from the landing: one description for the meta tag and the JSON-LD. */
export function landingDescription(
  landing: Pick<PoliticianFactCheckLanding, "author" | "claimed" | "about" | "bySource">
): string {
  const { author, claimed, about, bySource } = landing;
  const parts: string[] = [];
  if (claimed.length > 0) {
    parts.push(
      `${plural(claimed.length, "déclaration", "déclarations")} de ${author.fullName} ${claimed.length > 1 ? "vérifiées" : "vérifiée"} par ${bySource.map((s) => s.name).join(", ")}`
    );
  }
  if (about.length > 0) {
    parts.push(`${plural(about.length, "fact-check", "fact-checks")} à son sujet`);
  }
  if (parts.length === 0) {
    return `Les fact-checks des rédactions suivies par Poligraph qui citent ${author.fullName}.`;
  }
  return `${parts.join(", et ")} : verdicts, dates et liens vers les articles.`;
}
