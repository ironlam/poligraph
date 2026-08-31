/**
 * JSON-LD structured data components for SEO
 * @see https://schema.org
 */

/** Safely serialize JSON-LD, escaping </script> to prevent injection. */
const safeJsonLd = (data: object): string =>
  JSON.stringify(data).replace(/<\/script/gi, "<\\/script");

interface PersonJsonLdProps {
  name: string;
  givenName?: string;
  familyName?: string;
  jobTitle?: string;
  affiliation?: string;
  image?: string;
  birthDate?: string;
  deathDate?: string;
  birthPlace?: string;
  url: string;
  sameAs?: string[];
  memberOf?: Array<{ name: string }>;
}

export function PersonJsonLd({
  name,
  givenName,
  familyName,
  jobTitle,
  affiliation,
  image,
  birthDate,
  deathDate,
  birthPlace,
  url,
  sameAs,
  memberOf,
}: PersonJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name,
    ...(givenName && { givenName }),
    ...(familyName && { familyName }),
    ...(jobTitle && { jobTitle }),
    ...(affiliation && {
      affiliation: {
        "@type": "PoliticalParty",
        name: affiliation,
      },
    }),
    ...(image && { image }),
    ...(birthDate && { birthDate }),
    ...(deathDate && { deathDate }),
    ...(birthPlace && {
      birthPlace: {
        "@type": "Place",
        name: birthPlace,
      },
    }),
    url,
    ...(sameAs && sameAs.length > 0 && { sameAs }),
    ...(memberOf &&
      memberOf.length > 0 && {
        memberOf: memberOf.map((org) => ({
          "@type": "Organization",
          name: org.name,
        })),
      }),
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
  );
}

interface OrganizationJsonLdProps {
  name: string;
  alternateName?: string;
  description?: string;
  logo?: string;
  url: string;
  foundingDate?: string;
  dissolutionDate?: string;
  sameAs?: string[];
}

export function OrganizationJsonLd({
  name,
  alternateName,
  description,
  logo,
  url,
  foundingDate,
  dissolutionDate,
  sameAs,
}: OrganizationJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "PoliticalParty",
    name,
    ...(alternateName && { alternateName }),
    ...(description && { description }),
    ...(logo && { logo }),
    url,
    ...(foundingDate && { foundingDate }),
    ...(dissolutionDate && { dissolutionDate }),
    ...(sameAs && sameAs.length > 0 && { sameAs }),
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
  );
}

interface ParliamentaryGroupJsonLdProps {
  name: string;
  alternateName?: string;
  description?: string;
  url: string;
  foundingDate?: string;
  dissolutionDate?: string;
  memberOf?: { name: string; url: string };
}

export function ParliamentaryGroupJsonLd({
  name,
  alternateName,
  description,
  url,
  foundingDate,
  dissolutionDate,
  memberOf,
}: ParliamentaryGroupJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name,
    ...(alternateName && { alternateName }),
    ...(description && { description }),
    url,
    ...(foundingDate && { foundingDate }),
    ...(dissolutionDate && { dissolutionDate }),
    ...(memberOf && {
      memberOf: {
        "@type": "GovernmentOrganization",
        name: memberOf.name,
        url: memberOf.url,
      },
    }),
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
  );
}

interface WebSiteJsonLdProps {
  name: string;
  description: string;
  url: string;
}

export function WebSiteJsonLd({ name, description, url }: WebSiteJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    description,
    url,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${url}/recherche?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
  );
}

interface BreadcrumbJsonLdProps {
  items: Array<{
    name: string;
    url: string;
  }>;
}

export function BreadcrumbJsonLd({ items }: BreadcrumbJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
  );
}

interface DefinedTermJsonLdProps {
  name: string;
  description: string;
  url: string;
  alternateNames?: string[];
  sourceUrl: string;
  termSetUrl: string;
}

/** A reviewed civic definition attached to its source and to the presidential glossary. */
export function DefinedTermJsonLd({
  name,
  description,
  url,
  alternateNames = [],
  sourceUrl,
  termSetUrl,
}: DefinedTermJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name,
    description,
    url,
    ...(alternateNames.length > 0 && { alternateName: alternateNames }),
    sameAs: sourceUrl,
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      name: "Repères pour comprendre les programmes de la présidentielle 2027",
      url: termSetUrl,
    },
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
  );
}

interface DefinedTermSetJsonLdProps {
  name: string;
  description: string;
  url: string;
  terms: Array<{ name: string; url: string }>;
}

export function DefinedTermSetJsonLd({ name, description, url, terms }: DefinedTermSetJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    name,
    description,
    url,
    hasDefinedTerm: terms.map((term) => ({
      "@type": "DefinedTerm",
      name: term.name,
      url: term.url,
    })),
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
  );
}

interface FAQJsonLdProps {
  questions: Array<{
    question: string;
    answer: string;
  }>;
}

export function FAQJsonLd({ questions }: FAQJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map((q) => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: q.answer,
      },
    })),
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
  );
}

interface ItemListJsonLdProps {
  name: string;
  description?: string;
  items: Array<{
    name: string;
    url: string;
    image?: string;
    position?: number;
  }>;
  url: string;
}

export function ItemListJsonLd({ name, description, items, url }: ItemListJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    ...(description && { description }),
    url,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: item.position || index + 1,
      item: {
        "@type": "Person",
        name: item.name,
        url: item.url,
        ...(item.image && { image: item.image }),
      },
    })),
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
  );
}

interface EventJsonLdProps {
  name: string;
  description?: string;
  startDate: string;
  location?: string;
  url: string;
  organizer?: string;
}

export function EventJsonLd({
  name,
  description,
  startDate,
  location,
  url,
  organizer,
}: EventJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name,
    ...(description && { description }),
    startDate,
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    ...(location && {
      location: {
        "@type": "Place",
        name: location,
      },
    }),
    url,
    ...(organizer && {
      organizer: {
        "@type": "Organization",
        name: organizer,
      },
    }),
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
  );
}

interface LegislationJsonLdProps {
  name: string;
  description?: string;
  datePublished?: string;
  legislationIdentifier?: string;
  url: string;
}

export function LegislationJsonLd({
  name,
  description,
  datePublished,
  legislationIdentifier,
  url,
}: LegislationJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Legislation",
    name,
    ...(description && { description }),
    ...(datePublished && { datePublished }),
    ...(legislationIdentifier && { legislationIdentifier }),
    url,
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
  );
}

interface ArticleJsonLdProps {
  headline: string;
  description?: string;
  datePublished?: string;
  dateModified?: string;
  url: string;
  image?: string;
  author?: {
    name: string;
    url?: string;
  };
  about?: {
    name: string;
    url: string;
  };
}

export function ArticleJsonLd({
  headline,
  description,
  datePublished,
  dateModified,
  url,
  image,
  author,
  about,
}: ArticleJsonLdProps) {
  const resolvedAuthor = author ?? { name: "Poligraph", url: "https://poligraph.fr" };
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    ...(description && { description }),
    ...(datePublished && { datePublished }),
    ...(dateModified && { dateModified }),
    url,
    ...(image && { image }),
    author: {
      "@type": "Organization",
      name: resolvedAuthor.name,
      ...(resolvedAuthor.url && { url: resolvedAuthor.url }),
    },
    ...(about && {
      about: {
        "@type": "Person",
        name: about.name,
        url: about.url,
      },
    }),
    publisher: {
      "@type": "Organization",
      name: "Poligraph",
    },
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
  );
}

// ─── ClaimReview (Fact-check) ─────────────────────────────────

type FactCheckRatingValue =
  | "TRUE"
  | "MOSTLY_TRUE"
  | "HALF_TRUE"
  | "MISLEADING"
  | "OUT_OF_CONTEXT"
  | "MOSTLY_FALSE"
  | "FALSE"
  | "UNVERIFIABLE";

const VERDICT_RATING_VALUE: Record<FactCheckRatingValue, number> = {
  FALSE: 1,
  MOSTLY_FALSE: 2,
  MISLEADING: 2,
  OUT_OF_CONTEXT: 3,
  HALF_TRUE: 3,
  MOSTLY_TRUE: 4,
  TRUE: 5,
  UNVERIFIABLE: 3,
};

interface ClaimReviewJsonLdProps {
  url: string;
  claimText: string;
  claimant?: string | null;
  verdict: string;
  verdictRating: FactCheckRatingValue;
  reviewDate: string;
  source: string;
  sourceUrl: string;
}

export function ClaimReviewJsonLd({
  url,
  claimText,
  claimant,
  verdict,
  verdictRating,
  reviewDate,
  source,
  sourceUrl,
}: ClaimReviewJsonLdProps) {
  const ratingValue = VERDICT_RATING_VALUE[verdictRating];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ClaimReview",
    url,
    claimReviewed: claimText,
    ...(claimant && {
      itemReviewed: {
        "@type": "Claim",
        author: {
          "@type": "Person",
          name: claimant,
        },
      },
    }),
    reviewRating: {
      "@type": "Rating",
      ratingValue,
      bestRating: 5,
      worstRating: 1,
      alternateName: verdict,
    },
    datePublished: reviewDate,
    author: {
      "@type": "Organization",
      name: source,
      url: sourceUrl,
    },
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
  );
}

interface GovernmentOrganizationJsonLdProps {
  name: string;
  alternateName?: string;
  description?: string;
  url: string;
  logo?: string;
  address?: string;
}

export function GovernmentOrganizationJsonLd({
  name,
  alternateName,
  description,
  url,
  logo,
  address,
}: GovernmentOrganizationJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "GovernmentOrganization",
    name,
    ...(alternateName && { alternateName }),
    ...(description && { description }),
    url,
    ...(logo && { logo }),
    ...(address && {
      address: {
        "@type": "PostalAddress",
        addressCountry: "FR",
        addressLocality: address,
      },
    }),
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
  );
}

interface CollectionPageJsonLdProps {
  name: string;
  description: string;
  url: string;
  numberOfItems?: number;
  about?: {
    name: string;
    url: string;
  };
}

export function DatasetJsonLd({
  name,
  description,
  url,
}: {
  name: string;
  description: string;
  url: string;
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name,
    description,
    creator: { "@type": "Organization", name: "Poligraph", url: "https://poligraph.fr" },
    license: "https://creativecommons.org/licenses/by-sa/4.0/",
    distribution: [{ "@type": "DataDownload", encodingFormat: "text/html", contentUrl: url }],
  };
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
  );
}

export function AffairItemListJsonLd({
  name,
  items,
}: {
  name: string;
  items: Array<{ url: string; name: string }>;
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: it.url,
      name: it.name,
    })),
  };
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
  );
}

export function CollectionPageJsonLd({
  name,
  description,
  url,
  numberOfItems,
  about,
}: CollectionPageJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description,
    url,
    ...(numberOfItems !== undefined && {
      mainEntity: {
        "@type": "ItemList",
        numberOfItems,
      },
    }),
    ...(about && {
      about: {
        "@type": "Organization",
        name: about.name,
        url: about.url,
      },
    }),
    publisher: {
      "@type": "Organization",
      name: "Poligraph",
    },
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
  );
}
