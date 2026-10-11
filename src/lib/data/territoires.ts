import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { Prisma, type DataSource } from "@/generated/prisma";
import { db } from "@/lib/db";
import {
  PUBLIC_POLITICIAN_PUBLICATION_STATUS,
  PUBLIC_POLITICIAN_WHERE,
} from "@/lib/api/public-contract";
import { getMaireStatus, type MaireStatus } from "@/lib/data/elus";
import {
  readIntercommunalites,
  type IntercommunaliteBlock,
} from "@/lib/data/territoires-intercommunalites";
import { DEPARTMENTS, getDepartmentName, getDepartmentSlug } from "@/config/departments";
import {
  REGIONS,
  getRegionByCode,
  getRegionBySlug,
  getRegionForDepartment,
  getTerritoireHorsRegion,
  TERRITOIRES_HORS_REGION,
  type Region,
} from "@/config/regions";
import {
  getCollectivitesForCommune,
  getCollectivitesForDepartment,
  getCollectivitesForRegion,
  type CollectiviteParticuliere,
} from "@/config/collectivites-particulieres";
import { COMMUNE_DATA_SYNC_KEY, COMMUNE_POPULATION_SOURCE } from "@/config/communes";
import { DEPUTE_UNIQUE_MAX_POPULATION } from "@/config/populations-reference";
import {
  readDepartementPopulationVintages,
  readPopulationEnVigueur,
  type PopulationVintage,
} from "./commune-population";
import { DATA_SOURCE_LABELS, DATA_SOURCE_URLS } from "@/config/labels";
import {
  readCommunePresidentielles,
  type CommunePresidentielles,
} from "@/lib/data/territoires-presidentielle";

/**
 * Readers of the Territoires section (#1052): commune dossier, region, department, entry page,
 * search. Every fact carries its source and date; an absence is a state, never a zero.
 *
 * Dependencies and invalidation
 * -----------------------------
 * The cached readers below read Commune, Mandate (+ MandateLocal), Politician (publication
 * status), Candidacy, ElectoralList, CommuneElectionRound, Election, SyncMetadata and
 * CommuneIntercommunalite (+ Intercommunalite). Each one is
 * tagged with the tags the existing write paths already purge, so no new purge point is needed:
 *
 * - `politicians`: purged by `invalidateEntity("politician" | "mandate")`, which the admin
 *   publication/unpublication, identity correction, merge and manual mandate edits call, and by
 *   the daily sync (`revalidateRemoteCache([... "politicians" ...])`). A mayor, deputy or senator
 *   withdrawn from publication therefore leaves these pages on the next purge, without waiting for
 *   an RNE import. The RNE import itself (`npm run sync:rne:maires`, manual) purges nothing: its
 *   writes surface with the next daily `politicians` purge, or an operator purge of `territoires`.
 *   The intercommunality import (`npm run sync:intercommunalites`, manual) works the same way.
 * - `elections`: purged by `invalidateEntity("election")` and by `revalidateAll()` after a sync.
 * - `elections-municipales-2026`: the frozen results tag, purged only by an operator.
 * - `territoires`: operator-selectable (`NARROW_TAGS`), purges every reader here at once.
 * - `territoire:<code>`: one commune, department or region. No write path knows the territory
 *   of what it writes today, so this tag is only reachable by code; it is set for future
 *   targeted purges and costs nothing.
 *
 * The cache key space is bounded: every public entry point validates its parameter against a
 * closed format before reaching a `"use cache"` boundary. `searchTerritoires` takes free text and
 * is therefore never cached (AGENTS.md §5).
 */

// ─── Shared types ───────────────────────────────────────────────

/** State of a block: DISPONIBLE (shown with its source), NON_ETABLI (records exist but do not
 * establish the fact), ABSENT (nothing in the base). */
export type BlockState = "DISPONIBLE" | "NON_ETABLI" | "ABSENT";

export interface SourceRef {
  label: string;
  url: string | null;
}

export interface PersonRef {
  slug: string;
  fullName: string;
  photoUrl: string | null;
  /** "M." or "Mme" as recorded, null when unknown: drives grammatical agreement only. */
  civility: string | null;
}

export interface DepartmentRef {
  code: string;
  name: string | null;
  /** `/territoires/departements/<slug>`; null for codes without a department page (984, 989). */
  slug: string | null;
}

export interface RegionRef {
  code: string;
  name: string;
  slug: string;
}

export type CoverageBloc =
  | "identite"
  | "maire"
  | "mairesSecteur"
  | "conseilMunicipal"
  | "population"
  | "deputes"
  | "senateurs"
  | "municipales2026"
  | "intercommunalite"
  | "presidentielle"
  | "departements"
  | "presidence"
  | "conseil"
  | "communes";

/**
 * Reservation attached to a block whose fact is shown with a caveat.
 * CIRCONSCRIPTION_NON_VERIFIEE: the deputy is the one of the constituency recorded for the
 * commune, and nothing in the base says the commune lies in that constituency alone.
 * PLUSIEURS_CIRCONSCRIPTIONS: the commune is known to span several constituencies.
 */
export type CoverageReserve = "CIRCONSCRIPTION_NON_VERIFIEE" | "PLUSIEURS_CIRCONSCRIPTIONS";

export interface CoverageEntry {
  bloc: CoverageBloc;
  state: BlockState;
  source: SourceRef | null;
  /** ISO date the fact refers to or was last confirmed, null when unknown. */
  date: string | null;
  reserve?: CoverageReserve;
}

// ─── Constants ──────────────────────────────────────────────────

/** "35238", "2A004", "97411", "98735". */
const INSEE_CODE = /^(?:[0-9]{2}|2[AB])[0-9]{3}$/;
/** "35", "2A", "974". */
const DEPARTMENT_CODE = /^(?:[0-9]{2}|2[AB]|9[78][0-9])$/;

export const DEPARTEMENT_PAGE_SIZE = 50;
/** Pages beyond this are refused: the largest department holds under 900 communes. */
const MAX_DEPARTEMENT_PAGE = 40;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const MUNICIPALES_2026_SLUG = "municipales-2026";

/**
 * Communes under the PLM law, split into arrondissements and sectors. Each is known to span
 * several legislative constituencies, so the single `constituencyNumber` recorded for them
 * designates no deputy.
 */
const PLM_COMMUNES = new Set(["75056", "69123", "13055"]);

export { DEPUTE_UNIQUE_MAX_POPULATION };

const COG_SOURCE: SourceRef = {
  label: "Code officiel géographique (INSEE), via geo.api.gouv.fr",
  url: COMMUNE_POPULATION_SOURCE.url,
};

const POPULATION_SOURCE: SourceRef = {
  label: `${COMMUNE_POPULATION_SOURCE.label}, via ${COMMUNE_POPULATION_SOURCE.via}`,
  url: COMMUNE_POPULATION_SOURCE.url,
};

const MUNICIPALES_RESULTS_SOURCE: SourceRef = {
  label: "Ministère de l'Intérieur, résultats des élections municipales 2026 (data.gouv.fr)",
  url: "https://www.data.gouv.fr/datasets/elections-municipales-2026-resultats-du-premier-tour",
};

const TERRITOIRE_TAGS = ["territoires", "politicians", "elections"] as const;

// ─── Helpers ────────────────────────────────────────────────────

function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

function sourceOf(source: DataSource | null): SourceRef | null {
  if (!source) return null;
  return { label: DATA_SOURCE_LABELS[source], url: DATA_SOURCE_URLS[source] || null };
}

function departmentRef(code: string): DepartmentRef {
  const name = getDepartmentName(code);
  return { code, name, slug: name ? getDepartmentSlug(name) : null };
}

function regionRef(region: Region | null): RegionRef | null {
  return region ? { code: region.code, name: region.name, slug: region.slug } : null;
}

function personRef(p: {
  slug: string;
  fullName: string;
  photoUrl: string | null;
  blobPhotoUrl: string | null;
  civility?: string | null;
}): PersonRef {
  return {
    slug: p.slug,
    fullName: p.fullName,
    photoUrl: p.blobPhotoUrl ?? p.photoUrl,
    civility: p.civility ?? null,
  };
}

/** "Vendée (3)" -> 3. Null when the label carries no number. */
export function parseConstituencyNumber(constituency: string | null): number | null {
  const match = constituency?.match(/\((\d+)\)\s*$/);
  return match ? Number.parseInt(match[1]!, 10) : null;
}

/**
 * State of a single-holder office from the current holders, counted before the public filter.
 * Several holders, or a single non-public one, is NON_ETABLI: no name is chosen arbitrarily, and
 * the reason is not exposed.
 */
export function resolveTitulaire<T extends { publicationStatus: string }>(
  holders: T[]
): { state: "ETABLI" | "NON_ETABLI" | "ABSENT"; holder: T | null } {
  if (holders.length === 0) return { state: "ABSENT", holder: null };
  const only = holders[0]!;
  if (holders.length > 1 || only.publicationStatus !== PUBLIC_POLITICIAN_PUBLICATION_STATUS) {
    return { state: "NON_ETABLI", holder: null };
  }
  return { state: "ETABLI", holder: only };
}

async function getCommunesImportDate(): Promise<string | null> {
  const meta = await db.syncMetadata.findUnique({
    where: { sourceKey: COMMUNE_DATA_SYNC_KEY },
    select: { lastSyncAt: true },
  });
  return iso(meta?.lastSyncAt);
}

const PERSON_SELECT = {
  slug: true,
  fullName: true,
  photoUrl: true,
  blobPhotoUrl: true,
  civility: true,
} as const;

// ═══ Commune dossier ════════════════════════════════════════════

export interface MaireBlock {
  state: MaireStatus;
  /** Set only when state is ETABLI. */
  person: PersonRef | null;
  functionStart: string | null;
  mandateStart: string | null;
  lastConfirmedAt: string | null;
  source: SourceRef | null;
}

export interface MaireSecteur {
  person: PersonRef;
  /** RNE sector label ("Marseille Secteur 2"), null when the source gives none. */
  sectorLabel: string | null;
  functionStart: string | null;
  lastConfirmedAt: string | null;
  source: SourceRef | null;
}

export interface ParlementaireRef extends PersonRef {
  constituency: string | null;
  lastConfirmedAt: string | null;
  source: SourceRef | null;
}

export interface MunicipalesListe {
  listName: string | null;
  teteDeListe: { name: string; person: PersonRef | null };
  round1Votes: number | null;
  /** Share of votes cast (suffrages exprimés), in percent. */
  round1Pct: number | null;
  round2Votes: number | null;
  round2Pct: number | null;
  /** True only when `electionAuPremierTour` is ELUE. */
  elueAuPremierTour: boolean;
  /**
   * Election at the first round (Code électoral, art. L. 262): absolute majority of the votes
   * cast AND at least a quarter of the registered voters. NON_ETABLI when the registered count
   * is missing and the results import does not say either.
   */
  electionAuPremierTour: PremierTourVerdict;
  /** Elected at the second round, as recorded by the results import. */
  elueAuSecondTour: boolean;
}

export type PremierTourVerdict = "ELUE" | "NON_ELUE" | "NON_ETABLI";

/**
 * A list is elected at the first round only with more than half of the votes cast and a number
 * of votes at least equal to a quarter of the registered voters (art. L. 262 du Code électoral).
 * Without the registered count, the import's own `isElected` is the only other evidence, and it
 * is trusted only when the list did not go to a second round.
 */
export function resolvePremierTour(input: {
  round1Pct: number | null;
  round1Votes: number | null;
  registeredVoters: number | null;
  round2Pct: number | null;
  importIsElected: boolean;
}): PremierTourVerdict {
  const { round1Pct, round1Votes, registeredVoters } = input;
  if (round1Pct == null || round1Pct <= 50) return "NON_ELUE";
  if (input.round2Pct != null) return "NON_ELUE";
  if (registeredVoters != null && registeredVoters > 0 && round1Votes != null) {
    return round1Votes * 4 >= registeredVoters ? "ELUE" : "NON_ELUE";
  }
  return input.importIsElected ? "ELUE" : "NON_ETABLI";
}

export interface Participation {
  round: number;
  registeredVoters: number | null;
  actualVoters: number | null;
  validVotes: number | null;
  participationRate: number | null;
}

export interface MunicipalesBlock {
  state: BlockState;
  electionSlug: string;
  round1Date: string | null;
  round2Date: string | null;
  /** Head-of-list rows, sorted by round-1 share. Bounded to 50. */
  listes: MunicipalesListe[];
  participation: Participation[];
  source: SourceRef;
}

export interface CommuneDossier {
  identity: {
    inseeCode: string;
    name: string;
    postalCodes: string[];
    department: DepartmentRef;
    /** Null for the overseas territories outside any region. */
    region: RegionRef | null;
    /** Set for 975 to 989: the territory and its status, in place of a region. */
    territoireHorsRegion: { code: string; name: string; statut: string } | null;
    collectivitesParticulieres: CollectiviteParticuliere[];
    /** Town-centre position from the COG import, used only to place a decorative marker. */
    coordinates: { lat: number; lon: number } | null;
    source: SourceRef;
  };
  maire: MaireBlock;
  /** Arrondissement or sector mayors (PLM), public profiles only. Empty elsewhere. */
  mairesSecteur: MaireSecteur[];
  conseilMunicipal: {
    /** The current composition is not in the base: never substituted by ballot results. */
    state: "NON_ETABLI";
  };
  population: {
    value: number | null;
    /** Vintage in force (CommunePopulation). Null: geo.api.gouv.fr figure, vintage unknown. */
    vintage: PopulationVintage | null;
    importedAt: string | null;
    source: SourceRef;
  };
  parlement: {
    deputes: {
      state: BlockState;
      /** Constituency recorded for the commune. Not a proof that it is the only one. */
      circonscriptionEnregistree: number | null;
      /**
       * PLUSIEURS: the commune is known to span several constituencies (PLM), no deputy is named.
       * NON_VERIFIEE: nothing in the base says whether it spans one or several; the deputy shown
       * is the one of the recorded constituency, and may depend on the address.
       */
      couvertureCirconscriptions: "PLUSIEURS" | "NON_VERIFIEE";
      /** Named only when state is DISPONIBLE. */
      deputes: ParlementaireRef[];
      /**
       * Deputy of the recorded constituency, whatever the state, so a page can name them WITH
       * the reservation. Empty for PLM communes, where the recorded number designates nobody.
       */
      deputesCirconscriptionEnregistree: ParlementaireRef[];
      reserve: CoverageReserve;
    };
    senateurs: { state: BlockState; senateurs: ParlementaireRef[] };
  };
  elections: { municipales2026: MunicipalesBlock | null; presidentielles: CommunePresidentielles };
  /** Null until the first intercommunality import: no block is shown then. */
  intercommunalite: IntercommunaliteBlock | null;
  /** Published curated decisions concerning the commune (#1052, lot 2). 0 hides the link. */
  decisionsPubliees: number;
  coverage: CoverageEntry[];
}

async function readMaire(inseeCode: string): Promise<MaireBlock> {
  const status = await getMaireStatus(inseeCode);
  if (status.status !== "ETABLI" || !status.publicMandateId) {
    return {
      state: status.status,
      person: null,
      functionStart: null,
      mandateStart: null,
      lastConfirmedAt: null,
      source: null,
    };
  }

  const mandate = await db.mandate.findFirst({
    where: { id: status.publicMandateId, politician: PUBLIC_POLITICIAN_WHERE },
    select: {
      startDate: true,
      lastConfirmedAt: true,
      source: true,
      localData: { select: { functionStart: true } },
      politician: { select: PERSON_SELECT },
    },
  });

  // Unpublished between the two reads: say nothing rather than name someone.
  if (!mandate) {
    return {
      state: "NON_ETABLI",
      person: null,
      functionStart: null,
      mandateStart: null,
      lastConfirmedAt: null,
      source: null,
    };
  }

  return {
    state: "ETABLI",
    person: personRef(mandate.politician),
    functionStart: iso(mandate.localData?.functionStart),
    mandateStart: iso(mandate.startDate),
    lastConfirmedAt: iso(mandate.lastConfirmedAt),
    source: sourceOf(mandate.source),
  };
}

async function readMairesSecteur(inseeCode: string): Promise<MaireSecteur[]> {
  const rows = await db.mandate.findMany({
    where: {
      type: "MAIRE_ARRONDISSEMENT",
      isCurrent: true,
      localData: { communeId: inseeCode },
      politician: PUBLIC_POLITICIAN_WHERE,
    },
    select: {
      lastConfirmedAt: true,
      source: true,
      localData: { select: { functionStart: true, sectorLabel: true } },
      politician: { select: PERSON_SELECT },
    },
    orderBy: { localData: { sectorLabel: "asc" } },
    // Paris has 17 sectors, the largest case.
    take: 30,
  });

  return rows.map((r) => ({
    person: personRef(r.politician),
    sectorLabel: r.localData?.sectorLabel ?? null,
    functionStart: iso(r.localData?.functionStart),
    lastConfirmedAt: iso(r.lastConfirmedAt),
    source: sourceOf(r.source),
  }));
}

async function readParlementaires(
  type: "DEPUTE" | "SENATEUR",
  departmentCode: string
): Promise<ParlementaireRef[]> {
  const rows = await db.mandate.findMany({
    where: { type, isCurrent: true, departmentCode, politician: PUBLIC_POLITICIAN_WHERE },
    select: {
      constituency: true,
      lastConfirmedAt: true,
      source: true,
      politician: { select: { ...PERSON_SELECT, lastName: true } },
    },
    orderBy: { politician: { lastName: "asc" } },
    // The Nord has 21 deputies, Paris 12 senators.
    take: 40,
  });

  return rows.map((r) => ({
    ...personRef(r.politician),
    constituency: r.constituency,
    lastConfirmedAt: iso(r.lastConfirmedAt),
    source: sourceOf(r.source),
  }));
}

async function readMunicipales2026(inseeCode: string): Promise<MunicipalesBlock | null> {
  const election = await db.election.findUnique({
    where: { slug: MUNICIPALES_2026_SLUG },
    select: { id: true, round1Date: true, round2Date: true },
  });
  if (!election) return null;

  const heads = await db.candidacy.findMany({
    where: {
      electionId: election.id,
      communeId: inseeCode,
      listPosition: 1,
      OR: [{ electoralListId: null }, { electoralList: { publicationStatus: "PUBLISHED" } }],
    },
    select: {
      listName: true,
      candidateName: true,
      round1Votes: true,
      round1Pct: true,
      round2Votes: true,
      round2Pct: true,
      isElected: true,
      politician: { select: { ...PERSON_SELECT, publicationStatus: true } },
    },
    orderBy: { round1Pct: { sort: "desc", nulls: "last" } },
    take: 50,
  });

  const rounds = await db.communeElectionRound.findMany({
    where: { communeId: inseeCode, electionId: election.id },
    select: {
      round: true,
      registeredVoters: true,
      actualVoters: true,
      validVotes: true,
      participationRate: true,
    },
    orderBy: { round: "asc" },
    take: 2,
  });

  const registeredT1 = rounds.find((r) => r.round === 1)?.registeredVoters ?? null;

  const listes: MunicipalesListe[] = heads.map((h) => {
    const round1Pct = h.round1Pct != null ? Number(h.round1Pct) : null;
    const round2Pct = h.round2Pct != null ? Number(h.round2Pct) : null;
    const electionAuPremierTour = resolvePremierTour({
      round1Pct,
      round1Votes: h.round1Votes,
      registeredVoters: registeredT1,
      round2Pct,
      importIsElected: h.isElected,
    });
    const elueAuPremierTour = electionAuPremierTour === "ELUE";
    const isPublic = h.politician?.publicationStatus === PUBLIC_POLITICIAN_PUBLICATION_STATUS;
    return {
      listName: h.listName,
      teteDeListe: {
        name: h.candidateName,
        person: isPublic && h.politician ? personRef(h.politician) : null,
      },
      round1Votes: h.round1Votes,
      round1Pct,
      round2Votes: h.round2Votes,
      round2Pct,
      elueAuPremierTour,
      electionAuPremierTour,
      elueAuSecondTour: !elueAuPremierTour && round2Pct != null && h.isElected,
    };
  });

  const hasResults = listes.some((l) => l.round1Pct != null);
  let state: BlockState = hasResults ? "DISPONIBLE" : "ABSENT";
  if (!hasResults && listes.length === 0) {
    // Candidacies may exist without a head-of-list row: results are then not established.
    const any = await db.candidacy.count({
      where: { electionId: election.id, communeId: inseeCode },
    });
    if (any > 0) state = "NON_ETABLI";
  } else if (!hasResults) {
    state = "NON_ETABLI";
  }

  return {
    state,
    electionSlug: MUNICIPALES_2026_SLUG,
    round1Date: iso(election.round1Date),
    round2Date: iso(election.round2Date),
    listes,
    participation: rounds.map((r) => ({
      round: r.round,
      registeredVoters: r.registeredVoters,
      actualVoters: r.actualVoters,
      validVotes: r.validVotes,
      participationRate: r.participationRate != null ? Number(r.participationRate) : null,
    })),
    source: MUNICIPALES_RESULTS_SOURCE,
  };
}

/** Normalised INSEE code, or null when the input is not one. */
export function normalizeInseeCode(code: string): string | null {
  const normalized = code.trim().toUpperCase();
  return INSEE_CODE.test(normalized) ? normalized : null;
}

export async function getCommuneDossier(code: string): Promise<CommuneDossier | null> {
  const inseeCode = normalizeInseeCode(code);
  if (!inseeCode) return null;
  return readCommuneDossier(inseeCode);
}

async function readCommuneDossier(inseeCode: string): Promise<CommuneDossier | null> {
  "use cache";
  cacheLife("synced");
  cacheTag(...TERRITOIRE_TAGS, "elections-municipales-2026", `territoire:${inseeCode}`);

  const commune = await db.commune.findUnique({
    where: { id: inseeCode },
    select: {
      id: true,
      name: true,
      departmentCode: true,
      postalCodes: true,
      population: true,
      constituencyNumber: true,
      latitude: true,
      longitude: true,
    },
  });
  if (!commune) return null;

  // Sequential on purpose: a single page does not need to race for pool slots.
  const importedAt = await getCommunesImportDate();
  const maire = await readMaire(inseeCode);
  const mairesSecteur = await readMairesSecteur(inseeCode);
  const departmentDeputies = await readParlementaires("DEPUTE", commune.departmentCode);
  const senateurs = await readParlementaires("SENATEUR", commune.departmentCode);
  const municipales2026 = await readMunicipales2026(inseeCode);
  const populationEnVigueur = await readPopulationEnVigueur(inseeCode);
  const populationSource: SourceRef = populationEnVigueur
    ? { label: populationEnVigueur.vintage.sourceLabel, url: populationEnVigueur.vintage.sourceUrl }
    : POPULATION_SOURCE;
  const populationImportedAt = populationEnVigueur?.verifiedAt ?? importedAt;
  const decisionsPubliees = await db.decision.count({
    where: { communeId: inseeCode, status: "PUBLISHED" },
  });
  const intercommunalite = await readIntercommunalites(inseeCode);
  const presidentielles = await readCommunePresidentielles(inseeCode, commune.departmentCode);
  const lastPresidentielle = presidentielles.blocks[0];

  const plusieursCirconscriptions = PLM_COMMUNES.has(inseeCode);
  const circo = commune.constituencyNumber;
  const deputes =
    circo != null && !plusieursCirconscriptions
      ? departmentDeputies.filter((d) => parseConstituencyNumber(d.constituency) === circo)
      : [];
  // A commune of 20,000 inhabitants or more may well lie across several constituencies, and the
  // single recorded number cannot say otherwise: its deputy is named with the reservation, never
  // as established. Unknown population is treated the same way, nothing is presumed.
  const mayBeSplit =
    commune.population == null || commune.population >= DEPUTE_UNIQUE_MAX_POPULATION;
  const deputesState: BlockState =
    deputes.length === 1 && !mayBeSplit
      ? "DISPONIBLE"
      : circo == null && !plusieursCirconscriptions && departmentDeputies.length === 0
        ? "ABSENT"
        : "NON_ETABLI";
  const deputesReserve: CoverageReserve = plusieursCirconscriptions
    ? "PLUSIEURS_CIRCONSCRIPTIONS"
    : "CIRCONSCRIPTION_NON_VERIFIEE";

  const region = getRegionForDepartment(commune.departmentCode);
  const latestDeputyConfirmation = deputes[0]?.lastConfirmedAt ?? null;
  const latestSenatorConfirmation =
    senateurs
      .map((s) => s.lastConfirmedAt)
      .filter((d): d is string => d != null)
      .sort()
      .at(-1) ?? null;

  const coverage: CoverageEntry[] = [
    { bloc: "identite", state: "DISPONIBLE", source: COG_SOURCE, date: importedAt },
    {
      bloc: "maire",
      state: maire.state === "ETABLI" ? "DISPONIBLE" : maire.state,
      source: maire.source,
      date: maire.lastConfirmedAt,
    },
    ...(mairesSecteur.length > 0
      ? [
          {
            bloc: "mairesSecteur" as const,
            state: "DISPONIBLE" as const,
            source: mairesSecteur[0]!.source,
            date: mairesSecteur[0]!.lastConfirmedAt,
          },
        ]
      : []),
    { bloc: "conseilMunicipal", state: "NON_ETABLI", source: null, date: null },
    {
      bloc: "population",
      state: (populationEnVigueur?.value ?? commune.population) != null ? "DISPONIBLE" : "ABSENT",
      source: populationSource,
      date: populationImportedAt,
    },
    {
      bloc: "deputes",
      state: deputesState,
      source: deputes[0]?.source ?? null,
      date: latestDeputyConfirmation,
      reserve: deputesReserve,
    },
    {
      bloc: "senateurs",
      state: senateurs.length > 0 ? "DISPONIBLE" : "ABSENT",
      source: senateurs[0]?.source ?? null,
      date: latestSenatorConfirmation,
    },
    {
      bloc: "municipales2026",
      state: municipales2026?.state ?? "ABSENT",
      source: municipales2026 ? municipales2026.source : null,
      date: municipales2026?.round2Date ?? municipales2026?.round1Date ?? null,
    },
    ...(intercommunalite
      ? [
          {
            bloc: "intercommunalite" as const,
            // "Sans objet" is an established fact too: the commune belongs to none.
            state:
              intercommunalite.state === "NON_ETABLI"
                ? ("NON_ETABLI" as const)
                : ("DISPONIBLE" as const),
            source: intercommunalite.source,
            date: intercommunalite.situationDate,
          },
        ]
      : []),
    {
      bloc: "presidentielle",
      state: lastPresidentielle ? "DISPONIBLE" : "ABSENT",
      source: lastPresidentielle?.sources[0]
        ? { label: lastPresidentielle.sources[0].label, url: lastPresidentielle.sources[0].url }
        : null,
      date: lastPresidentielle?.importedAt ?? null,
    },
  ];

  return {
    decisionsPubliees,
    identity: {
      inseeCode: commune.id,
      name: commune.name,
      postalCodes: commune.postalCodes,
      department: departmentRef(commune.departmentCode),
      region: regionRef(region),
      territoireHorsRegion: getTerritoireHorsRegion(commune.departmentCode),
      collectivitesParticulieres: getCollectivitesForCommune(inseeCode),
      coordinates:
        commune.latitude != null && commune.longitude != null
          ? { lat: commune.latitude, lon: commune.longitude }
          : null,
      source: COG_SOURCE,
    },
    maire,
    mairesSecteur,
    conseilMunicipal: { state: "NON_ETABLI" },
    population: {
      value: populationEnVigueur?.value ?? commune.population,
      vintage: populationEnVigueur?.vintage ?? null,
      importedAt: populationImportedAt,
      source: populationSource,
    },
    parlement: {
      deputes: {
        state: deputesState,
        circonscriptionEnregistree: circo,
        couvertureCirconscriptions: plusieursCirconscriptions ? "PLUSIEURS" : "NON_VERIFIEE",
        deputes: deputesState === "DISPONIBLE" ? deputes : [],
        deputesCirconscriptionEnregistree: deputes,
        reserve: deputesReserve,
      },
      senateurs: { state: senateurs.length > 0 ? "DISPONIBLE" : "ABSENT", senateurs },
    },
    elections: { municipales2026, presidentielles },
    intercommunalite,
    coverage,
  };
}

// ═══ Executive of a department or region ════════════════════════

export interface PresidenceBlock {
  state: "ETABLI" | "NON_ETABLI" | "ABSENT";
  person: PersonRef | null;
  title: string | null;
  lastConfirmedAt: string | null;
  source: SourceRef | null;
}

/**
 * Executive mandates are entered by hand, not synced: on 2026-10-11 the base held one current
 * PRESIDENT_REGION (Martinique) and one PRESIDENT_DEPARTEMENT (Bouches-du-Rhône). An empty
 * result therefore means "not recorded", never "no president": it is NON_ETABLI, not ABSENT.
 */
async function readPresidence(where: Prisma.MandateWhereInput): Promise<PresidenceBlock> {
  const holders = await db.mandate.findMany({
    where: { ...where, isCurrent: true },
    select: {
      title: true,
      lastConfirmedAt: true,
      source: true,
      politician: { select: { ...PERSON_SELECT, publicationStatus: true } },
    },
    take: 3,
  });
  const { state, holder } = resolveTitulaire(
    holders.map((h) => ({ ...h, publicationStatus: h.politician.publicationStatus }))
  );
  return {
    state: state === "ABSENT" ? "NON_ETABLI" : state,
    person: holder ? personRef(holder.politician) : null,
    title: holder?.title ?? null,
    lastConfirmedAt: iso(holder?.lastConfirmedAt),
    source: holder ? sourceOf(holder.source) : null,
  };
}

// ═══ Region ═════════════════════════════════════════════════════

export interface RegionDepartement extends DepartmentRef {
  communeCount: number;
  deputeCount: number;
  senateurCount: number;
}

export interface RegionTerritoire {
  region: RegionRef & {
    chefLieu: { inseeCode: string; name: string };
    outreMer: boolean;
    source: SourceRef;
  };
  collectivitesParticulieres: CollectiviteParticuliere[];
  departements: RegionDepartement[];
  communeCount: number;
  presidence: PresidenceBlock;
  /** Regional councillors are not synced: the composition is never established (NON_ETABLI). */
  conseil: { state: BlockState; recordedCount: number };
  coverage: CoverageEntry[];
}

const REGION_SOURCE: SourceRef = {
  label: "Code officiel géographique 2026 (INSEE)",
  url: "https://www.insee.fr/fr/information/2560452",
};

async function countParlementairesByDepartment(
  type: "DEPUTE" | "SENATEUR",
  departmentCodes: readonly string[]
): Promise<Map<string, number>> {
  const rows = await db.mandate.groupBy({
    by: ["departmentCode"],
    where: {
      type,
      isCurrent: true,
      departmentCode: { in: [...departmentCodes] },
      politician: PUBLIC_POLITICIAN_WHERE,
    },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.departmentCode ?? "", r._count._all]));
}

async function countCommunesByDepartment(
  departmentCodes: readonly string[]
): Promise<Map<string, number>> {
  const rows = await db.commune.groupBy({
    by: ["departmentCode"],
    where: { departmentCode: { in: [...departmentCodes] } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.departmentCode, r._count._all]));
}

export async function getRegionTerritoire(slug: string): Promise<RegionTerritoire | null> {
  const region = getRegionBySlug(slug);
  if (!region) return null;
  return readRegionTerritoire(region.code);
}

async function readRegionTerritoire(regionCode: string): Promise<RegionTerritoire | null> {
  "use cache";
  cacheLife("synced");
  cacheTag(...TERRITOIRE_TAGS, `territoire:region-${regionCode}`);

  const region = getRegionByCode(regionCode);
  if (!region) return null;

  const communes = await countCommunesByDepartment(region.departmentCodes);
  const deputes = await countParlementairesByDepartment("DEPUTE", region.departmentCodes);
  const senateurs = await countParlementairesByDepartment("SENATEUR", region.departmentCodes);
  // No structured region key exists on PRESIDENT_REGION rows (MandateLocal.regionCode is empty).
  // The department code identifies the region only when the region has a single department
  // (the five DROM); otherwise the region name carried by `constituency` is the only key.
  const presidence = await readPresidence({
    type: "PRESIDENT_REGION",
    OR: [
      { constituency: region.name },
      ...(region.departmentCodes.length === 1
        ? [{ departmentCode: region.departmentCodes[0]! }]
        : []),
    ],
  });
  const conseillers = await db.mandate.count({
    where: {
      type: "CONSEILLER_REGIONAL",
      isCurrent: true,
      localData: { regionCode: region.code },
    },
  });

  const departements = region.departmentCodes
    .map((code) => ({
      ...departmentRef(code),
      communeCount: communes.get(code) ?? 0,
      deputeCount: deputes.get(code) ?? 0,
      senateurCount: senateurs.get(code) ?? 0,
    }))
    .sort((a, b) => (a.name ?? a.code).localeCompare(b.name ?? b.code, "fr"));

  const communeCount = departements.reduce((n, d) => n + d.communeCount, 0);
  const importedAt = await getCommunesImportDate();
  // Councillors are not synced either: zero recorded says nothing about the council.
  const conseilState: BlockState = "NON_ETABLI";

  return {
    region: {
      ...regionRef(region)!,
      chefLieu: region.chefLieu,
      outreMer: region.outreMer,
      source: REGION_SOURCE,
    },
    collectivitesParticulieres: getCollectivitesForRegion(region.code),
    departements,
    communeCount,
    presidence,
    conseil: { state: conseilState, recordedCount: conseillers },
    coverage: [
      { bloc: "departements", state: "DISPONIBLE", source: REGION_SOURCE, date: null },
      { bloc: "communes", state: "DISPONIBLE", source: COG_SOURCE, date: importedAt },
      {
        bloc: "presidence",
        state: presidence.state === "ETABLI" ? "DISPONIBLE" : presidence.state,
        source: presidence.source,
        date: presidence.lastConfirmedAt,
      },
      { bloc: "conseil", state: conseilState, source: null, date: null },
    ],
  };
}

// ═══ Department ═════════════════════════════════════════════════

export interface DepartementCommuneRow {
  inseeCode: string;
  name: string;
  population: number | null;
  maire: { state: MaireStatus; person: PersonRef | null };
}

export interface DepartementTerritoire {
  department: DepartmentRef;
  region: RegionRef | null;
  territoireHorsRegion: { code: string; name: string; statut: string } | null;
  collectivitesParticulieres: CollectiviteParticuliere[];
  communeCount: number;
  /** Population vintages in force across the department's communes, most common first. */
  populationVintages: (PopulationVintage & { communes: number })[];
  /** Exact count per initial letter (accents folded), letters without communes omitted. */
  letterCounts: Record<string, number>;
  communes: {
    letter: string | null;
    page: number;
    pageSize: number;
    /** Total for the active filter (letter or whole department). */
    total: number;
    totalPages: number;
    rows: DepartementCommuneRow[];
  };
  presidence: PresidenceBlock;
  /** Departmental councillors are not synced: partial at best, always NON_ETABLI. */
  conseil: { state: BlockState; recordedCount: number };
  parlement: { deputeCount: number; senateurCount: number };
  coverage: CoverageEntry[];
}

export interface DepartementQuery {
  page?: number;
  /** One letter A..Z; anything else is ignored. */
  letter?: string | null;
}

export function normalizeDepartmentCode(code: string): string | null {
  const normalized = code.trim().toUpperCase();
  return DEPARTMENT_CODE.test(normalized) ? normalized : null;
}

export async function getDepartementTerritoire(
  code: string,
  query: DepartementQuery = {}
): Promise<DepartementTerritoire | null> {
  const departmentCode = normalizeDepartmentCode(code);
  if (!departmentCode) return null;
  const letterInput = query.letter?.trim().toUpperCase() ?? null;
  const letter = letterInput && LETTERS.includes(letterInput) ? letterInput : null;
  const page = Math.trunc(query.page ?? 1);
  if (!Number.isFinite(page) || page < 1 || page > MAX_DEPARTEMENT_PAGE) return null;
  return readDepartementTerritoire(departmentCode, letter, page);
}

const FIRST_LETTER = Prisma.sql`upper(left(unaccent(c."name"), 1))`;

async function readDepartementTerritoire(
  departmentCode: string,
  letter: string | null,
  page: number
): Promise<DepartementTerritoire | null> {
  "use cache";
  cacheLife("synced");
  cacheTag(...TERRITOIRE_TAGS, `territoire:${departmentCode}`);

  const letterRows = await db.$queryRaw<{ letter: string; count: number }[]>(Prisma.sql`
    SELECT ${FIRST_LETTER} AS letter, COUNT(*)::int AS count
    FROM "Commune" c
    WHERE c."departmentCode" = ${departmentCode}
    GROUP BY 1
    ORDER BY 1
  `);
  if (letterRows.length === 0 && !DEPARTMENTS[departmentCode]) return null;

  const letterCounts = Object.fromEntries(letterRows.map((r) => [r.letter, r.count]));
  const communeCount = letterRows.reduce((n, r) => n + r.count, 0);
  const total = letter ? (letterCounts[letter] ?? 0) : communeCount;
  const totalPages = Math.max(1, Math.ceil(total / DEPARTEMENT_PAGE_SIZE));
  const offset = (page - 1) * DEPARTEMENT_PAGE_SIZE;

  const communeRows =
    offset < total
      ? await db.$queryRaw<{ id: string; name: string; population: number | null }[]>(Prisma.sql`
          SELECT c."id", c."name", c."population"
          FROM "Commune" c
          WHERE c."departmentCode" = ${departmentCode}
            ${letter ? Prisma.sql`AND ${FIRST_LETTER} = ${letter}` : Prisma.empty}
          ORDER BY unaccent(c."name"), c."id"
          LIMIT ${DEPARTEMENT_PAGE_SIZE} OFFSET ${offset}
        `)
      : [];

  const ids = communeRows.map((c) => c.id);
  const mayors = ids.length
    ? await db.mandate.findMany({
        where: {
          type: "MAIRE",
          isCurrent: true,
          localData: { communeId: { in: ids }, sectorLabel: null },
        },
        select: {
          localData: { select: { communeId: true } },
          politician: { select: { ...PERSON_SELECT, publicationStatus: true } },
        },
        // At most a handful of conflicts on top of one mayor per commune.
        take: DEPARTEMENT_PAGE_SIZE * 3,
      })
    : [];

  const mayorsByCommune = new Map<string, (typeof mayors)[number]["politician"][]>();
  for (const m of mayors) {
    const communeId = m.localData?.communeId;
    if (!communeId) continue;
    mayorsByCommune.set(communeId, [...(mayorsByCommune.get(communeId) ?? []), m.politician]);
  }

  const rows: DepartementCommuneRow[] = communeRows.map((c) => {
    const { state, holder } = resolveTitulaire(mayorsByCommune.get(c.id) ?? []);
    return {
      inseeCode: c.id,
      name: c.name,
      population: c.population,
      maire: { state, person: holder ? personRef(holder) : null },
    };
  });

  const presidence = await readPresidence({ type: "PRESIDENT_DEPARTEMENT", departmentCode });
  const conseillers = await db.mandate.count({
    where: { type: "CONSEILLER_DEPARTEMENTAL", isCurrent: true, departmentCode },
  });
  const deputes = await countParlementairesByDepartment("DEPUTE", [departmentCode]);
  const senateurs = await countParlementairesByDepartment("SENATEUR", [departmentCode]);
  const importedAt = await getCommunesImportDate();
  // Councillors are not synced either: zero recorded says nothing about the council.
  const conseilState: BlockState = "NON_ETABLI";

  return {
    department: departmentRef(departmentCode),
    region: regionRef(getRegionForDepartment(departmentCode)),
    territoireHorsRegion: getTerritoireHorsRegion(departmentCode),
    collectivitesParticulieres: getCollectivitesForDepartment(departmentCode),
    communeCount,
    populationVintages: await readDepartementPopulationVintages(departmentCode),
    letterCounts,
    communes: { letter, page, pageSize: DEPARTEMENT_PAGE_SIZE, total, totalPages, rows },
    presidence,
    conseil: { state: conseilState, recordedCount: conseillers },
    parlement: {
      deputeCount: deputes.get(departmentCode) ?? 0,
      senateurCount: senateurs.get(departmentCode) ?? 0,
    },
    coverage: [
      { bloc: "communes", state: "DISPONIBLE", source: COG_SOURCE, date: importedAt },
      {
        bloc: "presidence",
        state: presidence.state === "ETABLI" ? "DISPONIBLE" : presidence.state,
        source: presidence.source,
        date: presidence.lastConfirmedAt,
      },
      { bloc: "conseil", state: conseilState, source: null, date: null },
    ],
  };
}

// ═══ Entry page ═════════════════════════════════════════════════

export interface TerritoiresEntry {
  regions: Array<RegionRef & { outreMer: boolean; departementCount: number; communeCount: number }>;
  /** Overseas territories outside any region, with their communes in the base. */
  horsRegion: Array<{ code: string; name: string; statut: string; communeCount: number }>;
  national: {
    communeCount: number;
    /** Communes with exactly one current mayor, whose profile is public. */
    mairesEtablis: number;
    importedAt: string | null;
    source: SourceRef;
  };
}

export async function getTerritoiresEntry(): Promise<TerritoiresEntry> {
  "use cache";
  cacheLife("synced");
  cacheTag(...TERRITOIRE_TAGS);

  const byDepartment = await db.commune.groupBy({
    by: ["departmentCode"],
    _count: { _all: true },
  });
  const counts = new Map(byDepartment.map((r) => [r.departmentCode, r._count._all]));

  const [established] = await db.$queryRaw<{ count: number }[]>(Prisma.sql`
    SELECT COUNT(*)::int AS count FROM (
      SELECT ml."communeId"
      FROM "Mandate" m
      JOIN "MandateLocal" ml ON ml."mandateId" = m."id"
      JOIN "Politician" p ON p."id" = m."politicianId"
      WHERE m."type" = 'MAIRE' AND m."isCurrent" = true
        AND ml."sectorLabel" IS NULL AND ml."communeId" IS NOT NULL
      GROUP BY ml."communeId"
      HAVING COUNT(*) = 1
        AND bool_and(p."publicationStatus" = ${PUBLIC_POLITICIAN_PUBLICATION_STATUS})
    ) t
  `);

  return {
    regions: REGIONS.map((r) => ({
      ...regionRef(r)!,
      outreMer: r.outreMer,
      departementCount: r.departmentCodes.length,
      communeCount: r.departmentCodes.reduce((n, d) => n + (counts.get(d) ?? 0), 0),
    })).sort((a, b) => a.name.localeCompare(b.name, "fr")),
    horsRegion: Object.entries(TERRITOIRES_HORS_REGION).map(([code, t]) => ({
      code,
      ...t,
      communeCount: counts.get(code) ?? 0,
    })),
    national: {
      communeCount: byDepartment.reduce((n, r) => n + r._count._all, 0),
      mairesEtablis: established?.count ?? 0,
      importedAt: await getCommunesImportDate(),
      source: COG_SOURCE,
    },
  };
}

// ═══ Search ═════════════════════════════════════════════════════

export interface TerritoireSearchResult {
  communes: Array<{
    inseeCode: string;
    name: string;
    postalCodes: string[];
    population: number | null;
    department: DepartmentRef;
  }>;
  departements: DepartmentRef[];
  regions: RegionRef[];
}

const SEARCH_COMMUNE_LIMIT = 5;
const SEARCH_GROUP_LIMIT = 3;
/** A postal code shared by many communes must return all of them; this bounds the worst case. */
const POSTAL_CODE_LIMIT = 100;

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

type CommuneSearchRow = {
  id: string;
  name: string;
  postalCodes: string[];
  population: number | null;
  departmentCode: string;
};

const COMMUNE_SEARCH_SELECT = {
  id: true,
  name: true,
  postalCodes: true,
  population: true,
  departmentCode: true,
} as const;

async function searchCommunes(query: string): Promise<CommuneSearchRow[]> {
  if (/^\d{5}$/.test(query) || /^2[AB]\d{3}$/i.test(query)) {
    const code = query.toUpperCase();
    const byPostal = /^\d{5}$/.test(code)
      ? await db.commune.findMany({
          where: { postalCodes: { has: code } },
          select: COMMUNE_SEARCH_SELECT,
          orderBy: { name: "asc" },
          take: POSTAL_CODE_LIMIT,
        })
      : [];
    const byInsee = await db.commune.findUnique({
      where: { id: code },
      select: COMMUNE_SEARCH_SELECT,
    });
    return byInsee && !byPostal.some((c) => c.id === byInsee.id)
      ? [byInsee, ...byPostal]
      : byPostal;
  }

  if (query.length < 2) return [];
  const pattern = `${escapeLike(query)}%`;

  // Indexed first (idx_commune_name_trgm serves ILIKE on the raw column). The accent-folding
  // fallback scans the table, so it runs only when the indexed query finds nothing
  // ("evreux" for "Évreux").
  const indexed = await db.$queryRaw<CommuneSearchRow[]>(Prisma.sql`
    SELECT c."id", c."name", c."postalCodes", c."population", c."departmentCode"
    FROM "Commune" c
    WHERE c."name" ILIKE ${pattern}
    ORDER BY c."population" DESC NULLS LAST
    LIMIT ${SEARCH_COMMUNE_LIMIT}
  `);
  if (indexed.length > 0) return indexed;

  return db.$queryRaw<CommuneSearchRow[]>(Prisma.sql`
    SELECT c."id", c."name", c."postalCodes", c."population", c."departmentCode"
    FROM "Commune" c
    WHERE unaccent(c."name") ILIKE unaccent(${pattern})
    ORDER BY c."population" DESC NULLS LAST
    LIMIT ${SEARCH_COMMUNE_LIMIT}
  `);
}

/** Pure: departments matching a name or a code. Bounded by the config. */
export function matchDepartements(query: string): DepartmentRef[] {
  const folded = fold(query);
  if (!folded) return [];
  const code = query.trim().toUpperCase();
  const exact = DEPARTMENTS[code] ? [code] : [];
  // Exact name first, then prefix, then substring: "loire" must surface Loire before Haute-Loire.
  const rank = (name: string) => (name === folded ? 0 : name.startsWith(folded) ? 1 : 2);
  const byName = Object.entries(DEPARTMENTS)
    .filter(([c, d]) => !exact.includes(c) && fold(d.name).includes(folded))
    .sort(([, a], [, b]) => rank(fold(a.name)) - rank(fold(b.name)))
    .map(([c]) => c);
  return [...exact, ...byName].slice(0, SEARCH_GROUP_LIMIT).map(departmentRef);
}

/** Pure: regions matching a name. Bounded by the config. */
export function matchRegions(query: string): RegionRef[] {
  const folded = fold(query);
  if (!folded) return [];
  return REGIONS.filter((r) => fold(r.name).includes(folded))
    .slice(0, SEARCH_GROUP_LIMIT)
    .map((r) => regionRef(r)!);
}

/**
 * Free-text search across communes (name, postal code, INSEE code), departments and regions.
 * Never cached: the key would be unbounded (AGENTS.md §5). Every query is bounded.
 */
export async function searchTerritoires(rawQuery: string): Promise<TerritoireSearchResult> {
  const query = rawQuery.trim().slice(0, 80);
  if (query.length < 2) return { communes: [], departements: [], regions: [] };

  const communes = await searchCommunes(query);
  return {
    communes: communes.map((c) => ({
      inseeCode: c.id,
      name: c.name,
      postalCodes: c.postalCodes,
      population: c.population,
      department: departmentRef(c.departmentCode),
    })),
    departements: matchDepartements(query),
    regions: matchRegions(query),
  };
}
