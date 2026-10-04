import type { ComponentProps } from "react";
import type { Metadata } from "next";
import { MANDATE_TYPE_LABELS } from "@/config/labels";
import { statsHref, DEFAULT_STATS_TAB } from "@/config/routes";
import { SITE_URL } from "@/config/site";
import type { PersonJsonLd } from "@/components/seo/JsonLd";
import { formatCompactCurrency } from "@/lib/utils";
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

/** The metadata of a profile, from its identity alone. */
export function buildPoliticianMetadata(identity: PoliticianIdentity, slug: string): Metadata {
  const currentMandate = identity.mandates.find((m) => m.isCurrent);
  const role = currentMandate
    ? `${currentMandate.type === "DEPUTE" ? "Député" : currentMandate.type === "SENATEUR" ? "Sénateur" : "Représentant"}`
    : "Représentant politique";

  // Latest DIA declaration with details, for SEO.
  const details = latestInterestsDetails(identity);

  let hatvpDescription = "";
  if (details) {
    const parts: string[] = [];
    if (details.totalPortfolioValue && details.totalPortfolioValue > 0) {
      parts.push(
        `${formatCompactCurrency(details.totalPortfolioValue)} de participations financières déclarées`
      );
    }
    if (details.totalCompanies > 0) {
      parts.push(`${details.totalCompanies} sociétés déclarées`);
    }
    if (parts.length > 0) {
      hatvpDescription = ` ${parts.join(", ")}.`;
    }
  }

  const description = `${role} ${identity.currentParty ? `(${identity.currentParty.shortName})` : ""} - Consultez ses mandats, déclarations d'intérêts et affaires judiciaires.${hatvpDescription}`;

  // Bare profiles (RNE-imported mayors with no content) get noindex,follow (issue #385).
  // The two counters come from the identity read's filtered `_count`, under the same public
  // predicates the dossier read applies when it lists those same rows.
  const robots = politicianRobotsMetadata({
    mandates: identity.mandates.map((m) => ({
      type: m.type,
      communePopulation: m.localData?.commune?.population ?? null,
    })),
    publishedAffairsCount: identity._count.affairs,
    factCheckMentionsCount: identity._count.factCheckMentions,
    declarationsCount: identity.declarations.length,
    biography: identity.biography,
  });

  return {
    title: identity.fullName,
    description,
    ...robots,
    alternates: { canonical: `/politiques/${slug}` },
    openGraph: {
      title: `${identity.fullName} | Poligraph`,
      description,
      type: "profile",
      images: identity.photoUrl
        ? [
            {
              url: identity.photoUrl,
              width: 200,
              height: 200,
              alt: identity.fullName,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary",
      title: identity.fullName,
      description,
      images: identity.photoUrl ? [identity.photoUrl] : undefined,
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
    birthDate: identity.birthDate?.toISOString().split("T")[0],
    deathDate: identity.deathDate?.toISOString().split("T")[0],
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

  return {
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
