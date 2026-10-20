import { AN_LEGISLATURE_COVERAGE, AN_LEGISLATURE_FACTS, AN_SOURCES } from "@/config/legislatures";
import type { DataStatusKind } from "./data-status";
import { publicDates } from "./legislature-config";
import type {
  CoverageLevel,
  DatasetKey,
  DateKind,
  InstitutionalDate,
  InstitutionalSource,
  LegislatureCoverage,
  LegislatureFacts,
} from "./legislature-types";

/** Dates affichables, dans l'ordre d'affichage. Les autres natures restent internes. */
export const PUBLIC_DATE_ORDER: DateKind[] = [
  "election-first-round",
  "election-second-round",
  "previous-powers-expiry",
  "archive-start",
  "opening-sitting",
  "dissolution-decree",
  "dissolution-publication",
  "dissolution-entry-into-force",
  "archive-end",
  "powers-expiry",
];

export const DATE_KIND_LABELS: Record<DateKind, string> = {
  "election-first-round": "Élection, premier tour (métropole)",
  "election-second-round": "Élection, second tour (métropole)",
  "previous-powers-expiry": "Expiration des pouvoirs de l'Assemblée précédente",
  "previous-election-second-round": "Élection précédente, second tour",
  "mandate-start": "Début d'un mandat de député",
  "archive-start": "Début indiqué par les archives de l'Assemblée",
  "opening-sitting": "Première séance de la législature",
  "dissolution-decree": "Signature du décret de dissolution",
  "dissolution-publication": "Publication du décret au Journal officiel",
  "dissolution-entry-into-force": "Entrée en vigueur de la dissolution",
  "archive-end": "Fin indiquée par les archives de l'Assemblée",
  "powers-expiry": "Expiration des pouvoirs",
};

export const DATASET_LABELS: Record<DatasetKey, string> = {
  scrutins: "Scrutins publics",
  "individual-votes": "Votes individuels",
  "official-group-counts": "Décompte officiel par groupe",
  "deputy-mandates": "Mandats de député",
  "referenced-groups": "Groupes parlementaires référencés",
  "dated-group-membership": "Appartenance datée à un groupe",
  "computed-group-positions": "Positions de groupe calculées",
};

/**
 * Description publique de chaque jeu. Elle reste vraie à tout niveau de couverture : elle ne
 * dit jamais que la donnée est présente, c'est le niveau et la `publicNote` qui le disent.
 * Le périmètre méthodologique exact (identifiants,
 * requêtes, origines d'import) reste dans `DatasetCoverage.perimeter` et `method`,
 * réservés à la configuration et à l'audit : il ne s'affiche jamais sur une page citoyenne.
 */
export const DATASET_DESCRIPTIONS: Record<DatasetKey, string> = {
  scrutins: "Votes organisés en séance à l'Assemblée nationale.",
  "individual-votes": "Position de chaque député sur un scrutin.",
  "official-group-counts": "Décompte par groupe publié par l'Assemblée avec chaque scrutin.",
  "deputy-mandates": "Mandats de député sur la période de la législature.",
  "referenced-groups": "Groupes parlementaires de la législature.",
  "dated-group-membership": "Dates d'entrée et de sortie des députés dans leur groupe.",
  "computed-group-positions":
    "Positions de chaque groupe sur les scrutins, calculées par PoliGraph.",
};

export const COVERAGE_LEVEL_LABELS: Record<CoverageLevel, string> = {
  complete: "Complet",
  partial: "Partiel",
  unverified: "Non vérifié",
  absent: "Pas encore importé",
  withheld: "Non publié",
};

/**
 * Infobulle des niveaux qui partagent le statut `pending` : sans cela, « Non publié » hériterait
 * de « Donnée pas encore importée », ce qui est faux (la donnée existe, sa publication est suspendue).
 */
export const COVERAGE_LEVEL_DESCRIPTIONS: Partial<Record<CoverageLevel, string>> = {
  absent: "PoliGraph ne possède pas encore ces données.",
  withheld:
    "PoliGraph possède des données mais ne les affiche pas, leur fiabilité étant insuffisante.",
};

export function coverageToStatus(level: CoverageLevel): DataStatusKind {
  switch (level) {
    case "complete":
      return "complete";
    case "partial":
      return "partial";
    case "unverified":
      return "unverified";
    default:
      return "pending";
  }
}

export function ordinalLegislature(n: number): string {
  return n === 1 ? "1re" : `${n}e`;
}

const FACTS = new Map(AN_LEGISLATURE_FACTS.map((f) => [f.number, f]));
const COVERAGE = new Map(AN_LEGISLATURE_COVERAGE.map((c) => [c.number, c]));
const SOURCES = new Map(AN_SOURCES.map((s) => [s.id, s]));

export const LEGISLATURE_NUMBERS: number[] = AN_LEGISLATURE_FACTS.map((f) => f.number);

/** Valide un paramètre d'URL : entier décimal strict, présent dans la configuration. */
export function parseLegislatureParam(raw: string | undefined): number | null {
  if (!raw || !/^[1-9]\d{0,2}$/.test(raw)) return null;
  const n = Number(raw);
  return FACTS.has(n) ? n : null;
}

export interface LegislatureView {
  facts: LegislatureFacts;
  coverage: LegislatureCoverage;
  displayDates: InstitutionalDate[];
  period: string;
  sources: InstitutionalSource[];
}

function year(date: string): number {
  return Number(date.slice(0, 4));
}

/** « 2022-2024 » ou « depuis 2024 », de la première séance à la fin. */
export function legislaturePeriod(facts: LegislatureFacts): string {
  const opening = facts.dates.find((d) => d.kind === "opening-sitting");
  if (!opening) return "";
  if (facts.status === "ongoing") return `depuis ${year(opening.date)}`;
  const end =
    facts.dates.find((d) => d.kind === "archive-end") ??
    facts.dates.find((d) => d.kind === "dissolution-decree") ??
    facts.dates.find((d) => d.kind === "powers-expiry");
  return end ? `${year(opening.date)}-${year(end.date)}` : `depuis ${year(opening.date)}`;
}

/**
 * Bornes d'une législature, de la première séance à la fin, avec la même priorité de dates que
 * `legislaturePeriod`. `end` est `null` pour une législature en cours. Sert à rattacher un
 * mandat documenté à une législature, jamais à en déduire un mandat.
 */
export function legislatureSpan(
  facts: LegislatureFacts
): { start: string; end: string | null } | null {
  const opening = facts.dates.find((d) => d.kind === "opening-sitting");
  if (!opening) return null;
  if (facts.status === "ongoing") return { start: opening.date, end: null };
  const end =
    facts.dates.find((d) => d.kind === "archive-end") ??
    facts.dates.find((d) => d.kind === "dissolution-decree") ??
    facts.dates.find((d) => d.kind === "powers-expiry");
  return { start: opening.date, end: end?.date ?? null };
}

export function getLegislatureView(n: number): LegislatureView | null {
  const facts = FACTS.get(n);
  const coverage = COVERAGE.get(n);
  if (!facts || !coverage) return null;
  const shown = publicDates(facts).filter((d) => PUBLIC_DATE_ORDER.includes(d.kind));
  const displayDates = [...shown].sort(
    (a, b) => PUBLIC_DATE_ORDER.indexOf(a.kind) - PUBLIC_DATE_ORDER.indexOf(b.kind)
  );
  const ids = new Set<string>();
  for (const d of displayDates) d.sourceIds.forEach((id) => ids.add(id));
  facts.seats.legalBasisSourceIds.forEach((id) => ids.add(id));
  const sources = [...ids]
    .map((id) => SOURCES.get(id))
    .filter((s): s is InstitutionalSource => !!s);
  return { facts, coverage, displayDates, period: legislaturePeriod(facts), sources };
}

export function datasetLevel(coverage: LegislatureCoverage, key: DatasetKey): CoverageLevel {
  return coverage.datasets.find((d) => d.dataset === key)?.level ?? "absent";
}

/** Vrai quand au moins un jeu de scrutins ou de votes est importé : la page a un contenu propre. */
export function hasVotesData(coverage: LegislatureCoverage): boolean {
  return (["scrutins", "individual-votes"] as const).some(
    (k) => datasetLevel(coverage, k) !== "absent"
  );
}
