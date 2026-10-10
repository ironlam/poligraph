// Lecture des paramètres d'URL de la rubrique « Gouvernements » (spec §6.3 et §6.4).
// Toute valeur invalide est remplacée par son défaut et signalée par `invalid` (page en noindex).

export const MAX_MEMBERS_PAGE = 100;
export const MEMBERS_PAGE_SIZE = 50;
export const MAX_QUERY_LENGTH = 100;
export const MAX_PERSON_SLUG_LENGTH = 120;
const PERSON_SLUG = /^[a-z0-9-]+$/;

export type MembersFunctionFilter = "pm" | "ministre" | "delegue" | "secretaire";

export type MembersQuery = {
  mode: "periode" | "present";
  du: string;
  au: string;
  gouvernement: string | null;
  fonction: MembersFunctionFilter | null;
  q: string;
  /** Exact person slug (export detail link); `null` when absent or invalid. */
  personne: string | null;
  page: number;
};

const FUNCTION_FILTERS: readonly MembersFunctionFilter[] = [
  "pm",
  "ministre",
  "delegue",
  "secretaire",
];

/** Jour calendaire `YYYY-MM-DD` existant, sinon `null` (`2026-02-30` est refusé). */
export function parseCompositionDate(raw: string | undefined): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10) === raw ? raw : null;
}

/**
 * Paramètres de la page Membres. `coverage` donne les défauts de `du` et `au`, `slugs` les
 * gouvernements publiés : un slug hors de cette liste est ignoré. Un paramètre vide vaut absent.
 */
export function parseMembersQuery(
  sp: Record<string, string | undefined>,
  coverage: { from: string; to: string },
  slugs: ReadonlySet<string>
): { query: MembersQuery; invalid: boolean } {
  let invalid = false;
  const present = (key: string): string | undefined => (sp[key] ? sp[key] : undefined);

  let mode: MembersQuery["mode"] = "periode";
  const rawMode = present("mode");
  if (rawMode === "present" || rawMode === "periode") mode = rawMode;
  else if (rawMode !== undefined) invalid = true;

  const readDate = (key: string): string | null => {
    const raw = present(key);
    if (raw === undefined) return null;
    const date = parseCompositionDate(raw);
    if (date === null) invalid = true;
    return date;
  };
  let du = readDate("du") ?? coverage.from;
  let au = readDate("au") ?? coverage.to;
  // `du` ne sert qu'en mode période : « Présents au » ne lit que `au`.
  if (mode === "periode" && du > au) {
    invalid = true;
    du = coverage.from;
    au = coverage.to;
  }

  let gouvernement: string | null = null;
  const rawGov = present("gouvernement");
  if (rawGov !== undefined) {
    if (slugs.has(rawGov)) gouvernement = rawGov;
    else invalid = true;
  }

  let fonction: MembersFunctionFilter | null = null;
  const rawFunction = present("fonction");
  if (rawFunction !== undefined) {
    const match = FUNCTION_FILTERS.find((f) => f === rawFunction);
    if (match) fonction = match;
    else invalid = true;
  }

  let page = 1;
  const rawPage = present("page");
  if (rawPage !== undefined) {
    const n = /^\d+$/.test(rawPage) ? Number(rawPage) : 0;
    if (n >= 1) page = Math.min(n, MAX_MEMBERS_PAGE);
    else invalid = true;
  }

  const q = (sp.q ?? "").trim().slice(0, MAX_QUERY_LENGTH);

  let personne: string | null = null;
  const rawPerson = present("personne");
  if (rawPerson !== undefined) {
    if (rawPerson.length <= MAX_PERSON_SLUG_LENGTH && PERSON_SLUG.test(rawPerson)) {
      personne = rawPerson;
    } else invalid = true;
  }

  return { query: { mode, du, au, gouvernement, fonction, q, personne, page }, invalid };
}
