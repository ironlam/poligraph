import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import type { CandidacyStatus, MeasureAttribution, ThemeCategory } from "@/generated/prisma";
import {
  PUBLIC_HUB_CANDIDACY_WHERE,
  PUBLIC_PRESIDENTIAL_FICHE_WHERE,
  PUBLIC_PRESIDENTIAL_MEASURE_WHERE,
} from "@/lib/presidentielle/publication";
import { PRESIDENTIELLE_2027_SLUG, THEMES_IN_ORDER } from "@/lib/presidentielle/themes";

const PARTY_EDITION_LIMIT = 30;

export type PartyPresidentialCandidacy = {
  candidacyId: string;
  candidateName: string;
  politicianSlug: string;
  status: CandidacyStatus;
  /** False while the hub names the person but the full fiche is not open: no link then. */
  ficheOpen: boolean;
  measureCount: number;
  partyProgramMeasureCount: number;
};

export type PartyPresidentialTheme = {
  theme: ThemeCategory;
  measureCount: number;
};

export type PartyPresidentialEdition = {
  id: string;
  label: string;
  publishedAt: Date;
  documentUrl: string;
};

export type PartyPresidentialProgramme = {
  candidacies: PartyPresidentialCandidacy[];
  /** Themes in hub order, zero-count themes left out. Counts span every candidacy of the party. */
  themes: PartyPresidentialTheme[];
  measureCount: number;
  editions: PartyPresidentialEdition[];
};

/**
 * What the 2027 presidential hub publishes for one party: the tracked candidacies attached to
 * it, the public measures those candidacies carry, counted by theme, and the party's published
 * programme documents. Counts only: the measures themselves live on the hub pages.
 *
 * Returns null when the party has no tracked candidacy, so callers render nothing rather than
 * an empty block.
 */
export async function getPartyPresidentialProgramme(
  partyId: string,
  partySlug: string
): Promise<PartyPresidentialProgramme | null> {
  "use cache";
  cacheTag(`party:${partySlug}`);
  cacheLife("synced");

  const election = await db.election.findUnique({
    where: { slug: PRESIDENTIELLE_2027_SLUG },
    select: { id: true },
  });
  if (election === null) return null;
  cacheTag(`election-measures:${election.id}`, `election-candidacies:${election.id}`);

  const scope = { electionId: election.id, partyId };
  const [rows, openFiches, grouped, editions] = await Promise.all([
    db.candidacy.findMany({
      where: { ...scope, ...PUBLIC_HUB_CANDIDACY_WHERE },
      select: {
        id: true,
        candidateName: true,
        status: true,
        politician: { select: { slug: true, fullName: true } },
      },
      orderBy: { candidateName: "asc" },
      // A party fields a handful of personalities at most. A literal, because the read-bounds
      // guard cannot see through a named constant.
      take: 20,
    }),
    db.candidacy.findMany({
      where: { ...scope, ...PUBLIC_PRESIDENTIAL_FICHE_WHERE },
      select: { id: true },
      take: 20,
    }),
    db.measure.groupBy({
      by: ["candidacyId", "theme", "attribution"],
      where: {
        electionId: election.id,
        ...PUBLIC_PRESIDENTIAL_MEASURE_WHERE,
        candidacy: { is: { ...PUBLIC_PRESIDENTIAL_FICHE_WHERE, partyId } },
      },
      _count: { _all: true },
    }),
    db.programEdition.findMany({
      where: { ...scope, ownerType: "PARTY", publicationStatus: "PUBLISHED" },
      select: { id: true, label: true, publishedAt: true, documentUrl: true },
      orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
      take: PARTY_EDITION_LIMIT,
    }),
  ]);

  if (rows.length === 0) return null;

  const open = new Set(openFiches.map((row) => row.id));
  const perCandidacy = new Map<string, Record<MeasureAttribution, number>>();
  const perTheme = new Map<ThemeCategory, number>();
  for (const group of grouped) {
    if (group.candidacyId === null) continue;
    const counts = perCandidacy.get(group.candidacyId) ?? { PERSONAL: 0, PARTY_PROGRAM: 0 };
    counts[group.attribution] += group._count._all;
    perCandidacy.set(group.candidacyId, counts);
    perTheme.set(group.theme, (perTheme.get(group.theme) ?? 0) + group._count._all);
  }

  const candidacies = rows.flatMap((row): PartyPresidentialCandidacy[] => {
    // The tracked predicate already requires both; this narrows the nullable columns.
    if (row.status === null || row.politician?.slug == null) return [];
    const counts = perCandidacy.get(row.id) ?? { PERSONAL: 0, PARTY_PROGRAM: 0 };
    return [
      {
        candidacyId: row.id,
        candidateName: row.politician.fullName,
        politicianSlug: row.politician.slug,
        status: row.status,
        ficheOpen: open.has(row.id),
        measureCount: counts.PERSONAL + counts.PARTY_PROGRAM,
        partyProgramMeasureCount: counts.PARTY_PROGRAM,
      },
    ];
  });
  if (candidacies.length === 0) return null;

  // Hub order first, then any legacy theme still present in the data.
  const ordered: ThemeCategory[] = [
    ...THEMES_IN_ORDER,
    ...[...perTheme.keys()].filter(
      (theme) => !(THEMES_IN_ORDER as readonly string[]).includes(theme)
    ),
  ];
  const themes = ordered.flatMap((theme) => {
    const measureCount = perTheme.get(theme) ?? 0;
    return measureCount > 0 ? [{ theme, measureCount }] : [];
  });

  return {
    candidacies,
    themes,
    measureCount: themes.reduce((sum, theme) => sum + theme.measureCount, 0),
    editions,
  };
}
