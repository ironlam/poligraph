import { SITE_URL } from "@/config/site";

/**
 * Structured data of a /factchecks/[slug] page.
 *
 * Poligraph does not write fact-checks: it relays the verdict of a third-party newsroom and adds
 * the context it alone can cross (politician, party, votes, candidacy). The page used to emit
 * ClaimReview, which declares the page carrying it as the fact-check itself. Google's Fact Check
 * API then listed poligraph.fr as the reviewer of articles written by AFP, Le Monde or TF1 Info,
 * and generative engines read that markup to attribute a verification. Google also dropped the
 * ClaimReview rich result in June 2025, so the markup earned nothing and said something false.
 *
 * A WebPage says what the page really is: a page about a person that cites the newsroom's
 * article (`citation`, `isBasedOn`), with the newsroom as that article's publisher.
 *
 * @see https://schema.org/WebPage
 * @see https://developers.google.com/search/blog/2025/06/simplifying-search-results
 */

export interface FactCheckJsonLdPerson {
  slug: string;
  fullName: string;
}

export interface FactCheckJsonLdInput {
  slug: string;
  title: string;
  description: string;
  /** When the newsroom published its article. */
  publishedAt: Date;
  /** When Poligraph published its page. */
  createdAt: Date;
  source: string;
  sourceUrl: string;
  /** The politician who made the claim, when known. */
  author: FactCheckJsonLdPerson | null;
  /** Every public politician linked to the fact-check, authors and subjects alike. */
  people: FactCheckJsonLdPerson[];
}

const isoDate = (date: Date): string => date.toISOString().split("T")[0]!;

const personNode = (person: FactCheckJsonLdPerson) => ({
  "@type": "Person",
  name: person.fullName,
  url: `${SITE_URL}/politiques/${person.slug}`,
});

export function buildFactCheckJsonLd(input: FactCheckJsonLdInput) {
  // The page is about the author of the claim; failing that, about the person the rumour targets.
  // Several subjects without an author: none is singled out, they all go under `mentions`.
  let aboutPerson: FactCheckJsonLdPerson | null = input.author;
  if (!aboutPerson && input.people.length === 1) {
    aboutPerson = input.people[0]!;
  }

  const sourceArticle = {
    "@type": "CreativeWork",
    url: input.sourceUrl,
    headline: input.title,
    datePublished: isoDate(input.publishedAt),
    ...(input.source && { publisher: { "@type": "Organization", name: input.source } }),
  };

  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    url: `${SITE_URL}/factchecks/${input.slug}`,
    name: input.title,
    description: input.description,
    inLanguage: "fr-FR",
    datePublished: isoDate(input.createdAt),
    publisher: { "@type": "Organization", name: "Poligraph", url: SITE_URL },
    ...(aboutPerson && { about: personNode(aboutPerson) }),
    ...(input.people.length > 0 && { mentions: input.people.map(personNode) }),
    citation: sourceArticle,
    isBasedOn: input.sourceUrl,
  };
}
