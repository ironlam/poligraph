// Lignes des exports CSV de la rubrique « Gouvernements » (spec §7 et §13).
// Les présences viennent de `filterMembers` et `compositionAt`, comme pour les pages.

import { SITE_URL } from "@/config/site";
import { normalizeText } from "@/lib/name-matching";
import { compositionAt } from "./composition";
import type { GovernmentEpisode, PersonCard, PublishedGovernment } from "./mapping";
import { filterMembers, membersCoverage, type MemberRow, type MembersData } from "./members";
import { parseMembersQuery, type MembersQuery } from "./params";
import type { Category, DateEvidence, FunctionType } from "./types";

type Det = GovernmentEpisode["startDetermination"];

export type FunctionExportRow = {
  ma_id: string;
  pg_id: string;
  nom: string;
  url_profil: string;
  gouvernement: string;
  slug_gouvernement: string;
  type: string;
  intitule: string;
  debut: string;
  preuve_debut: string;
  mode_debut: string;
  acte_debut: string;
  source_debut: string;
  fin: string;
  preuve_fin: string;
  mode_fin: string;
  acte_fin: string;
  source_fin: string;
  nature_fin: string;
  affaires_courantes_jusqu_au: string;
  derniere_confirmation: string;
  categorie?: string;
};

export type PersonExportRow = {
  pg_id: string;
  nom: string;
  url_profil: string;
  gouvernements: string;
  fonctions: number;
  premiere_nomination: string;
  derniere_fin: string;
  periode_a_preciser: string;
  sources: string;
  detail: string;
};

const col = <K extends string>(key: K, header: K = key) => ({ key, header });

export const FUNCTION_COLUMNS = [
  "ma_id",
  "pg_id",
  "nom",
  "url_profil",
  "gouvernement",
  "slug_gouvernement",
  "type",
  "intitule",
  "debut",
  "preuve_debut",
  "mode_debut",
  "acte_debut",
  "source_debut",
  "fin",
  "preuve_fin",
  "mode_fin",
  "acte_fin",
  "source_fin",
  "nature_fin",
  "affaires_courantes_jusqu_au",
  "derniere_confirmation",
].map((k) => col(k as keyof FunctionExportRow));

export const COMPOSITION_COLUMNS = [...FUNCTION_COLUMNS, col("categorie" as const)];

export const PERSON_COLUMNS = [
  "pg_id",
  "nom",
  "url_profil",
  "gouvernements",
  "fonctions",
  "premiere_nomination",
  "derniere_fin",
  "periode_a_preciser",
  "sources",
  "detail",
].map((k) => col(k as keyof PersonExportRow));

const TYPE_LABEL: Record<FunctionType, string> = {
  PREMIER_MINISTRE: "Premier ministre",
  MINISTRE: "Ministre",
  MINISTRE_DELEGUE: "Ministre délégué",
  SECRETAIRE_ETAT: "Secrétaire d'État",
};

const EVIDENCE_LABEL: Record<DateEvidence, string> = {
  ACT: "acte",
  DATASET: "jeu de données",
  DERIVED: "déduite",
};

const DETERMINATION_LABEL: Record<NonNullable<Det>, string> = {
  EXPLICIT: "explicite",
  CONVENTION: "convention",
  DEDUCTION: "déduction",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  established: "établie",
  currentAffairs: "affaires courantes",
  transition: "transition",
  undocumented: "à préciser",
};

const CATEGORY_ORDER: Category[] = ["established", "currentAffairs", "transition", "undocumented"];
const TYPE_ORDER: FunctionType[] = [
  "PREMIER_MINISTRE",
  "MINISTRE",
  "MINISTRE_DELEGUE",
  "SECRETAIRE_ETAT",
];

/** Profile URL only for a published profile: a pending person is listed without a link. */
export function profileUrl(person: PersonCard): string {
  return person.visibility === "published" ? `${SITE_URL}/politiques/${person.slug}` : "";
}

export function functionRow(
  episode: GovernmentEpisode,
  person: PersonCard,
  gov: PublishedGovernment | undefined,
  category?: Category
): FunctionExportRow {
  // Caretaker end: the function's own end if recorded, else the government's end when an act
  // attests the regime and the function ended with the collective resignation.
  const attested = gov?.currentAffairsAttested === true && gov.resignedEvidence === "ACT";
  const caretakerEnd =
    attested && episode.endKind === "COLLECTIVE_RESIGNATION"
      ? (episode.currentAffairsEndedAt ?? gov.endedAt)
      : null;
  return {
    ma_id: episode.mandatePublicId ?? "",
    pg_id: person.publicId ?? "",
    nom: person.fullName,
    url_profil: profileUrl(person),
    gouvernement: gov?.name ?? "",
    slug_gouvernement: gov?.slug ?? "",
    type: TYPE_LABEL[episode.type],
    intitule: episode.title,
    debut: episode.start,
    preuve_debut: episode.startEvidence ? EVIDENCE_LABEL[episode.startEvidence] : "",
    mode_debut: episode.startDetermination ? DETERMINATION_LABEL[episode.startDetermination] : "",
    acte_debut: episode.startAct?.label ?? "",
    source_debut: episode.startAct?.url ?? episode.startSourceUrl ?? "",
    fin: episode.end ?? "",
    preuve_fin: episode.endEvidence ? EVIDENCE_LABEL[episode.endEvidence] : "",
    mode_fin: episode.endDetermination ? DETERMINATION_LABEL[episode.endDetermination] : "",
    acte_fin: episode.endAct?.label ?? "",
    source_fin: episode.endAct?.url ?? episode.endSourceUrl ?? "",
    nature_fin:
      episode.endKind === "INDIVIDUAL"
        ? "individuelle"
        : episode.endKind === "COLLECTIVE_RESIGNATION"
          ? "cessation collective"
          : "",
    affaires_courantes_jusqu_au: caretakerEnd ?? "",
    derniere_confirmation: episode.lastConfirmedAt ?? "",
    ...(category ? { categorie: CATEGORY_LABEL[category] } : {}),
  };
}

/** One row per function of the already filtered members (hidden persons are never in `rows`). */
export function functionRows(
  rows: MemberRow[],
  govById: Map<string, PublishedGovernment>
): FunctionExportRow[] {
  return rows.flatMap((row) =>
    row.functions.map((fn) =>
      functionRow(fn.episode, row.person, govById.get(fn.episode.governmentId))
    )
  );
}

export function personRows(
  rows: MemberRow[],
  govById: Map<string, PublishedGovernment>,
  detailUrl: (person: PersonCard) => string
): PersonExportRow[] {
  return rows.map(({ person, functions }) => {
    const episodes = functions.map((f) => f.episode);
    const slugs = [
      ...new Set(episodes.map((e) => govById.get(e.governmentId)?.slug).filter(Boolean)),
    ];
    const ends = episodes.map((e) => e.end);
    const sources = new Set<string>();
    for (const e of episodes) {
      for (const url of [e.startAct?.url ?? e.startSourceUrl, e.endAct?.url ?? e.endSourceUrl]) {
        if (url) sources.add(url);
      }
    }
    return {
      pg_id: person.publicId ?? "",
      nom: person.fullName,
      url_profil: profileUrl(person),
      gouvernements: slugs.join(";"),
      fonctions: episodes.length,
      premiere_nomination: episodes.map((e) => e.start).sort()[0] ?? "",
      derniere_fin: ends.some((e) => e === null) ? "" : (ends.sort().at(-1) ?? ""),
      periode_a_preciser: functions.some(
        (f) => f.status === "undocumented" || f.status === "transition"
      )
        ? "oui"
        : "non",
      sources: [...sources].join(";"),
      detail: detailUrl(person),
    };
  });
}

/** Functions of one government at `date`, hidden persons left out, with the page's categories. */
export function compositionRows(
  gov: PublishedGovernment,
  episodes: GovernmentEpisode[],
  people: Record<string, PersonCard>,
  date: string
): FunctionExportRow[] {
  const own = episodes.filter((e) => e.governmentId === gov.id);
  const result = compositionAt(gov, own, date);
  if (result.status !== "ok") return [];
  const byId = new Map(own.map((e) => [e.membershipId, e]));
  const items: { episode: GovernmentEpisode; person: PersonCard; category: Category }[] = [];
  for (const category of CATEGORY_ORDER) {
    for (const { membershipId } of result.byCategory[category]) {
      const episode = byId.get(membershipId);
      const person = episode ? people[episode.politicianId] : undefined;
      if (!episode || !person || person.visibility === "hidden") continue;
      items.push({ episode, person, category });
    }
  }
  const key = (i: (typeof items)[number]) =>
    `${CATEGORY_ORDER.indexOf(i.category)}|${TYPE_ORDER.indexOf(i.episode.type)}|${normalizeText(i.person.lastName)}|${i.episode.membershipId}`;
  items.sort((a, b) => key(a).localeCompare(key(b)));
  return items.map((i) => functionRow(i.episode, i.person, gov, i.category));
}

/** Same parsing and filtering as the members page; no coverage or no composition gives no row. */
export function filteredMembers(
  govs: PublishedGovernment[],
  data: MembersData,
  raw: Record<string, string | undefined>
): { rows: MemberRow[]; query: MembersQuery } | null {
  const coverage = membersCoverage(govs);
  if (!coverage) return null;
  const { query } = parseMembersQuery(raw, coverage, new Set(govs.map((g) => g.slug)));
  const result = filterMembers(govs, data, query);
  return { rows: result.status === "ok" ? result.persons : [], query };
}
