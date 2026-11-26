import type { ComponentProps } from "react";
import type { Metadata } from "next";
import { MANDATE_TYPE_LABELS } from "@/config/labels";
import { statsHref, DEFAULT_STATS_TAB } from "@/config/routes";
import { SITE_URL } from "@/config/site";
import type { PersonJsonLd } from "@/components/seo/JsonLd";
import { formatCompactCurrency, normalizeImageUrl } from "@/lib/utils";
import { politicianRobotsMetadata } from "@/lib/seo/politician-robots";
import { getPoliticianProfile, readProfileSnapshot } from "@/lib/data/politician-profile";
import {
  getPoliticianPresidentialCandidacy,
  loadPoliticianPresidentialCandidacy,
  loadPresidentialElectionId,
  type PoliticianCandidacy,
} from "@/lib/data/politician-candidacy";
import type {
  PoliticianDossier,
  PoliticianIdentity,
  ProfileVoteStats,
} from "@/lib/data/politician-profile-reads";
import type { PoliticianProfileDocument } from "@/lib/politicians/profile-snapshot/document";
import { resolveProfileMandateType } from "@/lib/politicians/profile-snapshot/build";
import type { DeclarationDetails } from "@/types/hatvp";
import type { PoliticianProfileBodyProps } from "./_components/PoliticianProfileBody";
import { parisDay } from "@/lib/governments/dates";
import { openGraph, SEGMENT_IMAGE_FILE } from "@/lib/seo/open-graph";

export type PoliticianPageData = {
  profile: PoliticianProfileDocument;
  presidentialCandidacy: PoliticianCandidacy | null;
};

/**
 * `loadPoliticianPage` with every cache boundary removed, the same reads in the same order: the
 * stored document, the presidential election id, then the candidacy. Exported for the integration
 * test that counts the queries of a cold render; the page calls `loadPoliticianPage`.
 */
export async function loadPoliticianPageUncached(slug: string): Promise<PoliticianPageData | null> {
  const profile = await readProfileSnapshot(slug);
  if (!profile) return null;
  const electionId = await loadPresidentialElectionId();
  const presidentialCandidacy =
    electionId === null ? null : await loadPoliticianPresidentialCandidacy(profile.identity.id);
  return { profile, presidentialCandidacy };
}

/**
 * Everything the profile page reads. The document comes from the same cache entry as
 * `generateMetadata`; the candidacy stays a live read under the presidential tags.
 *
 * Null means the person is missing or not public, and the page answers 404. The document holds
 * the identity and the dossier together, so the old split case (identity found, dossier gone)
 * cannot happen: there is never an empty dossier to serve.
 */
export async function loadPoliticianPage(slug: string): Promise<PoliticianPageData | null> {
  const profile = await getPoliticianProfile(slug);
  if (!profile) return null;
  const presidentialCandidacy = await getPoliticianPresidentialCandidacy(profile.identity.id);
  return { profile, presidentialCandidacy };
}

function latestInterestsDetails(identity: PoliticianIdentity): DeclarationDetails | null {
  const latestDIA = identity.declarations.find((d) => d.type === "INTERETS" && d.details);
  return (latestDIA?.details as DeclarationDetails | null | undefined) ?? null;
}

/** What the search snippet of a profile may say beyond its identity. */
export type PoliticianSnippetContext = {
  voteStats?: ProfileVoteStats | null;
  candidacy?: Pick<PoliticianCandidacy, "status"> | null;
};

const plural = (count: number, one: string, many: string) => (count > 1 ? many : one);
const formatCount = (count: number) => count.toLocaleString("fr-FR");

/** Statuses the snippet names: an announced or official run. A press hypothesis is not a run. */
function announcesCandidacy(candidacy: PoliticianSnippetContext["candidacy"]): boolean {
  return candidacy?.status === "DECLARE" || candidacy?.status === "OFFICIAL";
}

/** Votes cast (for, against, abstention) in the chamber the profile shows. */
function castVotes(voteStats: ProfileVoteStats | null | undefined): number {
  const stats = voteStats?.voteData.stats;
  return stats ? stats.pour + stats.contre + stats.abstention : 0;
}

function hasAssetDeclaration(identity: PoliticianIdentity): boolean {
  return identity.declarations.some((d) => d.type !== "INTERETS");
}

/**
 * Title of a profile: the name, then up to three sections the profile actually holds. Judicial
 * matters are never named here, for the reason given on `drawJusticeNote`: a word or a count
 * beside a name cannot tell a conviction from a mention.
 */
export function buildPoliticianTitle(
  identity: PoliticianIdentity,
  context: PoliticianSnippetContext = {}
): string {
  const sections: string[] = [];
  if (announcesCandidacy(context.candidacy)) sections.push("candidature 2027");
  if (identity.mandates.length > 0) {
    sections.push(plural(identity.mandates.length, "mandat", "mandats"));
  }
  if (castVotes(context.voteStats) > 0) sections.push("votes");
  if (hasAssetDeclaration(identity)) sections.push("patrimoine");
  if (identity._count.factCheckMentions > 0) sections.push("fact-checks");

  const shown = sections.slice(0, 3);
  if (shown.length === 0) return identity.fullName;
  const list =
    shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(", ")} et ${shown.at(-1)}`;
  return `${identity.fullName} : ${list}`;
}

/**
 * Meta description of a profile, from the figures the profile shows. Same rule as the title: no
 * judicial word, no judicial count.
 */
export function buildPoliticianDescription(
  identity: PoliticianIdentity,
  context: PoliticianSnippetContext = {}
): string {
  const sentences: string[] = [];

  const currentMandate = identity.mandates.find((m) => m.isCurrent);
  if (currentMandate) {
    const title = currentMandate.title.charAt(0).toUpperCase() + currentMandate.title.slice(1);
    const shortName = identity.currentParty?.shortName;
    // Some titles already name the party ("Président de l'Union populaire républicaine (UPR)").
    const party = shortName && !title.includes(`(${shortName})`) ? ` (${shortName})` : "";
    sentences.push(`${title}${party}.`);
  } else if (identity.currentParty) {
    sentences.push(`Parti : ${identity.currentParty.name}.`);
  }

  if (context.candidacy?.status === "OFFICIAL") {
    sentences.push("Candidature officielle à la présidentielle 2027.");
  } else if (context.candidacy?.status === "DECLARE") {
    sentences.push("Candidature annoncée à la présidentielle 2027.");
  }

  const facts: string[] = [];
  // A single mandate is already named by the first sentence, and its start date alone reads as
  // the start of a career the base may only partly hold.
  const mandateCount = identity.mandates.length;
  if (mandateCount > 1) {
    const firstYear = Math.min(
      ...identity.mandates.map((m) => new Date(m.startDate).getUTCFullYear())
    );
    facts.push(`${formatCount(mandateCount)} mandats depuis ${firstYear}`);
  }
  const votes = castVotes(context.voteStats);
  if (votes > 0) {
    const chamber =
      resolveProfileMandateType(identity) === "SENATEUR" ? "au Sénat" : "à l'Assemblée nationale";
    facts.push(`${formatCount(votes)} ${plural(votes, "vote", "votes")} ${chamber}`);
  }
  const factChecks = identity._count.factCheckMentions;
  if (factChecks > 0) {
    facts.push(`${formatCount(factChecks)} ${plural(factChecks, "fact-check", "fact-checks")}`);
  }
  if (identity.declarations.length > 0) {
    facts.push(
      hasAssetDeclaration(identity)
        ? "déclarations de patrimoine et d'intérêts (HATVP)"
        : "déclarations d'intérêts (HATVP)"
    );
  }
  if (facts.length > 0) {
    const text = facts.join(", ");
    sentences.push(`${text.charAt(0).toUpperCase()}${text.slice(1)}.`);
  }

  // Latest DIA declaration with details.
  const details = latestInterestsDetails(identity);
  if (details) {
    const parts: string[] = [];
    if (details.totalPortfolioValue && details.totalPortfolioValue > 0) {
      parts.push(
        `${formatCompactCurrency(details.totalPortfolioValue)} de participations financières déclarées`
      );
    }
    if (details.totalCompanies > 0) {
      parts.push(
        `${details.totalCompanies} ${plural(details.totalCompanies, "société déclarée", "sociétés déclarées")}`
      );
    }
    if (parts.length > 0) {
      const text = parts.join(", ");
      sentences.push(`${text.charAt(0).toUpperCase()}${text.slice(1)}.`);
    }
  }

  return sentences.length > 0
    ? sentences.join(" ")
    : `Fiche de ${identity.fullName} sur Poligraph : mandats et sources.`;
}

/** The metadata of a profile, from its identity and what the page reads beside it. */
export function buildPoliticianMetadata(
  identity: PoliticianIdentity,
  slug: string,
  context: PoliticianSnippetContext = {}
): Metadata {
  const title = buildPoliticianTitle(identity, context);
  const description = buildPoliticianDescription(identity, context);

  // Bare profiles (RNE-imported mayors with no content) get noindex,follow (issue #385).
  // The two counters come from the identity read's filtered `_count`, under the same public
  // predicates the dossier read applies when it lists those same rows.
  const robots = politicianRobotsMetadata({
    mandates: identity.mandates.map((m) => ({
      type: m.type,
      communePopulation: m.localData?.commune?.population ?? null,
    })),
    publishedAffairsCount: identity._count.affairs,
    // Mentions matched on a last name alone and not yet validated give no indexation signal.
    factCheckMentionsCount: identity.factChecksAwaitReview ? 0 : identity._count.factCheckMentions,
    declarationsCount: identity.declarations.length,
    biography: identity.biography,
  });

  // Some upstream portraits are stored with an http:// address, which a share card must not carry.
  const sharePhoto = normalizeImageUrl(identity.photoUrl);

  return {
    title,
    description,
    ...robots,
    alternates: { canonical: `/politiques/${slug}` },
    openGraph: openGraph({
      title: `${identity.fullName} | Poligraph`,
      description,
      type: "profile",
      images: sharePhoto
        ? [
            {
              url: sharePhoto,
              width: 200,
              height: 200,
              alt: identity.fullName,
            },
          ]
        : SEGMENT_IMAGE_FILE,
    }),
    twitter: {
      card: "summary",
      title: identity.fullName,
      description,
      images: sharePhoto ? [sharePhoto] : undefined,
    },
  };
}

/**
 * Every value the page derives from the profile, kept out of the JSX so the integration test
 * compares what the page actually renders from, document against live reads.
 */
export function derivePoliticianPageModel(
  identity: PoliticianIdentity,
  dossier: PoliticianDossier,
  voteStats: ProfileVoteStats | null
) {
  const currentMandate = identity.mandates.find((m) => m.isCurrent);
  // Mandates arrive sorted by startDate desc, so the headline mandate of a sitting
  // parliamentarian who also holds a local one is the local mandate. The votes tab, the card,
  // the group badge and the comparison link read this one instead, or they serve an empty votes
  // tab to 42 people. The header, the metadata and the JSON-LD still headline `currentMandate`.
  const currentParliamentaryMandate = identity.mandates.find(
    (m) => m.isCurrent && (m.type === "DEPUTE" || m.type === "SENATEUR")
  );
  const currentGroup = currentParliamentaryMandate?.parliamentaryData?.parliamentaryGroup;
  const isActiveParliamentarian = currentParliamentaryMandate !== undefined;
  const isChamberPresident = identity.mandates.some(
    (m) => m.isCurrent && m.role != null && /^Président /.test(m.role)
  );
  // The chamber whose votes the profile shows, derived the way the document builder derives it.
  const mandateType = resolveProfileMandateType(identity);

  // Companies where the politician is a board member, for JSON-LD.
  const memberOfOrgs =
    latestInterestsDetails(identity)
      ?.financialParticipations.filter((p) => p.isBoardMember)
      .map((p) => ({ name: p.company }))
      .slice(0, 10) ?? [];

  const profileUrl = `${SITE_URL}/politiques/${identity.slug}`;

  const share = {
    title: identity.fullName,
    text: `${identity.fullName}${currentMandate ? `, ${MANDATE_TYPE_LABELS[currentMandate.type]}` : ""}${identity.currentParty ? ` (${identity.currentParty.shortName})` : ""}`,
    url: profileUrl,
  };

  const personJsonLd: ComponentProps<typeof PersonJsonLd> = {
    name: identity.fullName,
    givenName: identity.firstName,
    familyName: identity.lastName,
    jobTitle: currentMandate ? MANDATE_TYPE_LABELS[currentMandate.type] : undefined,
    affiliation: identity.currentParty?.name,
    image: identity.photoUrl || undefined,
    birthDate: identity.birthDate ? parisDay(identity.birthDate) : undefined,
    deathDate: identity.deathDate ? parisDay(identity.deathDate) : undefined,
    birthPlace: identity.birthPlace || undefined,
    url: profileUrl,
    sameAs: identity.externalIds.map((e) => e.url).filter((url): url is string => url != null),
    memberOf: memberOfOrgs.length > 0 ? memberOfOrgs : undefined,
  };

  const body: PoliticianProfileBodyProps = {
    politician: identity,
    dossier,
    voteStats,
    currentParliamentaryMandate:
      currentParliamentaryMandate && mandateType
        ? {
            type: mandateType,
            title: currentParliamentaryMandate.title,
            constituency: currentParliamentaryMandate.constituency,
          }
        : null,
    currentGroup: currentGroup ?? null,
    isActiveParliamentarian,
    isChamberPresident,
  };

  const isDepute = currentParliamentaryMandate?.type === "DEPUTE";
  const isSenateur = currentParliamentaryMandate?.type === "SENATEUR";
  const statsUrl = isDepute
    ? statsHref("participation", { chamber: "AN" })
    : isSenateur
      ? statsHref("participation", { chamber: "SENAT" })
      : statsHref(DEFAULT_STATS_TAB);
  const statsLabel = isDepute
    ? "les statistiques de l'Assemblée nationale"
    : isSenateur
      ? "les statistiques du Sénat"
      : "les statistiques générales";
  const stats = {
    url: statsUrl,
    label: statsLabel,
    aria: `Voir ${statsLabel} pour comparer ${identity.firstName} ${identity.lastName}`,
  };

  // What the share card prints. The judicial counters of the identity stay off it on purpose: see
  // `drawJusticeNote`. The parliamentary mandate headlines the card for the reason given above.
  const votingStats = voteStats?.voteData.stats ?? null;
  const plural = (count: number, one: string, many: string) => {
    if (count > 1) return many;
    return one;
  };
  const factChecks = identity._count.factCheckMentions;
  const card = {
    mandateLabel: (currentParliamentaryMandate ?? currentMandate)?.title ?? null,
    votes: votingStats && {
      votesFor: votingStats.pour,
      votesAgainst: votingStats.contre,
      votesAbstain: votingStats.abstention,
    },
    stats: [
      {
        value: identity.mandates.length,
        label: plural(identity.mandates.length, "mandat exercé", "mandats exercés"),
      },
      {
        value: identity.declarations.length,
        label: plural(identity.declarations.length, "déclaration HATVP", "déclarations HATVP"),
      },
      { value: factChecks, label: plural(factChecks, "fact-check", "fact-checks") },
    ],
  };

  return {
    card,
    currentMandate,
    currentParliamentaryMandate,
    currentGroup,
    mandateType,
    share,
    personJsonLd,
    body,
    stats,
  };
}
