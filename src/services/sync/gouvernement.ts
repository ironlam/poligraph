import { db } from "@/lib/db";
import { confirmedFromResourceUrl } from "@/lib/mandates/confirmation";
import { generateSlug } from "@/lib/utils";
import { MandateType, DataSource, type DateEvidence } from "@/generated/prisma";
import { parse } from "csv-parse/sync";
import { GouvernementCSV, GouvernementSyncResult, GOUV_FUNCTION_MAPPING } from "./types";
import { politicianService } from "@/services/politician";
import { parseFrenchDate as parseCanonicalFrenchDate } from "@/lib/parsing";
import * as fs from "fs";
import * as path from "path";
import { HTTPClient } from "@/lib/api/http-client";
import { DATA_GOUV_RATE_LIMIT_MS } from "@/config/rate-limits";
import { sanitizeGovernmentTitle } from "./government-title";
import { safeJsonParseOrThrow } from "@/lib/api/safe-json";
import { GOVERNMENT_SYNC_FROZEN } from "./government-sync-guard";
import { governmentSlugForLegacyName } from "@/lib/governments/catalog";
import { parisDay, parisMidnight } from "@/lib/governments/dates";

// Règles (spec §5.5, révision 3) :
// - aucune clôture implicite : une fonction en cours absente de la source va dans `toVerify` ;
// - une source publiée avant `compositionVerifiedAt` du gouvernement en exercice n'écrit rien
//   sur les fonctions en cours ;
// - une fonction dont une date est prouvée par un acte (`ACT`) n'est jamais modifiée ;
// - `lastConfirmedAt` n'est jamais écrit ici : seule une composition vérifiée le pose ;
// - aucune fonction close n'est rouverte ;
// - `planSync` décide sans écrire, `applySync` exécute le plan. Le dry-run s'arrête au plan.

const client = new HTTPClient({ rateLimitMs: DATA_GOUV_RATE_LIMIT_MS });

const CORRECTIONS_FILE = path.join(process.cwd(), "data", "government-corrections.json");

export const DATA_GOUV_CSV_URL =
  "https://static.data.gouv.fr/resources/historique-des-gouvernements-de-la-veme-republique/20250313-105416/liste-membres-gouvernements-5eme-republique.csv";

const COMPOSITION_URL = "https://www.info.gouv.fr/composition-du-gouvernement";

const GOVERNMENT_FUNCTION_TYPES = [
  MandateType.PREMIER_MINISTRE,
  MandateType.MINISTRE,
  MandateType.MINISTRE_DELEGUE,
  MandateType.SECRETAIRE_ETAT,
];

/** Seuls champs d'identité qu'une entrée `updateMembers` peut modifier. */
export const UPDATE_MEMBER_ALLOWED_FIELDS = [
  "firstName",
  "lastName",
  "fullName",
  "civility",
  "birthDate",
] as const;
type AllowedIdentityField = (typeof UPDATE_MEMBER_ALLOWED_FIELDS)[number];

export interface GovernmentCorrections {
  _updated?: string;
  endMandates?: Array<{ politicianName?: string; mandateType?: string; endDate?: string }>;
  newMembers?: Array<{
    firstName?: string;
    lastName: string;
    fullName: string;
    civility?: string;
    birthDate?: string;
    mandate: { type: string; title: string; startDate: string; government: string };
    party?: string;
  }>;
  updateMembers?: Array<{
    politicianName: string;
    updates: Record<string, unknown>;
    _disabled?: boolean;
  }>;
}

// ── Lectures ──────────────────────────────────────────────────────────────

export interface ExistingFunction {
  id: string;
  type: MandateType;
  title: string;
  institution: string;
  startDate: Date;
  endDate: Date | null;
  isCurrent: boolean;
  source: DataSource | null;
  sourceUrl: string | null;
  officialUrl: string | null;
  externalId: string | null;
  governmentData: {
    governmentName: string;
    governmentId: string | null;
    startEvidence: DateEvidence | null;
    endEvidence: DateEvidence | null;
  } | null;
}

export interface ExistingPolitician {
  id: string;
  slug: string;
  fullName: string;
  firstName: string;
  lastName: string;
  civility: string | null;
  birthDate: Date | null;
  gouvExternalIds: string[];
  mandates: ExistingFunction[];
}

export interface SyncInput {
  currentOnly: boolean;
  records: GouvernementCSV[];
  /** Jour de publication du CSV (`YYYY-MM-DD`), null si l'URL ne le porte pas. */
  sourcePublishedDay: string | null;
  governments: Array<{ id: string; slug: string; name: string }>;
  inOffice: { slug: string; compositionVerifiedDay: string | null } | null;
  /** Personne retrouvée pour chaque ligne du CSV (clé `recordKey`). */
  politicianByRecord: Map<string, ExistingPolitician | null>;
  /** Fonctions gouvernementales en cours dans la base (pour `toVerify`). */
  currentFunctions: Array<{
    politicianId: string;
    politicianSlug: string;
    fullName: string;
    type: MandateType;
    governmentName: string | null;
  }>;
  corrections: GovernmentCorrections | null;
  /** Personnes retrouvées par nom complet (minuscules) pour endMandates et updateMembers. */
  politiciansByFullName: Map<string, ExistingPolitician[]>;
  /** Personne retrouvée pour chaque entrée newMembers (clé `slug`). */
  politicianByNewMemberSlug: Map<string, ExistingPolitician | null>;
  partyIdByName: Map<string, string | null>;
}

// ── Plan ──────────────────────────────────────────────────────────────────

export interface PlannedFunction {
  type: MandateType;
  title: string;
  institution: string;
  startDay: string;
  endDay: string | null;
  isCurrent: boolean;
  source: DataSource;
  sourceUrl: string;
  officialUrl: string;
  externalId: string | null;
  governmentName: string;
  governmentId: string | null;
  startEvidence: DateEvidence | null;
  endEvidence: DateEvidence | null;
}

export interface NewPolitician {
  slug: string;
  firstName: string;
  lastName: string;
  fullName: string;
  civility: string | null;
  birthDay: string | null;
  partyId: string | null;
}

export interface CreateOp {
  label: string;
  politician: { kind: "existing"; id: string } | { kind: "new"; data: NewPolitician };
  mandate: PlannedFunction;
  /** Identifiant source à rattacher à la personne (ExternalId GOUVERNEMENT). */
  externalId: string | null;
}

export type MandateChanges = Partial<
  Pick<
    PlannedFunction,
    | "type"
    | "title"
    | "institution"
    | "startDay"
    | "endDay"
    | "isCurrent"
    | "source"
    | "sourceUrl"
    | "officialUrl"
    | "externalId"
  >
>;

export type UpdateOp =
  | {
      kind: "mandate";
      label: string;
      mandateId: string;
      changes: MandateChanges;
      governmentName?: string;
      startEvidence?: DateEvidence;
      endEvidence?: DateEvidence;
    }
  | {
      kind: "politician";
      label: string;
      politicianId: string;
      data: Partial<Record<AllowedIdentityField, string | null>>;
    };

export type LinkOp =
  | { kind: "government"; label: string; mandateId: string; governmentId: string }
  | { kind: "externalId"; label: string; politicianId: string; externalId: string };

export interface SyncPlan {
  creates: CreateOp[];
  updates: UpdateOp[];
  links: LinkOp[];
  /** Fonctions à vérifier à la main : jamais closes ni rouvertes par le sync. */
  toVerify: string[];
  /** Libellés de gouvernement sans `Government` correspondant (rattachement laissé vide). */
  unresolvedLabels: string[];
  /** Fonctions prouvées par un acte, laissées intactes. */
  skippedActVerified: string[];
  /** Sources écartées parce que plus anciennes que la composition vérifiée. */
  staleSources: string[];
  errors: string[];
}

export function emptyPlan(): SyncPlan {
  return {
    creates: [],
    updates: [],
    links: [],
    toVerify: [],
    unresolvedLabels: [],
    skippedActVerified: [],
    staleSources: [],
    errors: [],
  };
}

// ── Parsing ───────────────────────────────────────────────────────────────

/** Jour `YYYY-MM-DD` d'une date française « vendredi 13 décembre 2024 », ou null. */
export function parseFrenchDay(dateStr: string | undefined): string | null {
  if (!dateStr || dateStr.trim() === "") return null;
  const withoutDayName = dateStr.trim().replace(/^\S+\s+/, "");
  const d = parseCanonicalFrenchDate(withoutDayName);
  if (!d) return null;
  // parseFrenchDate construit la date en heure locale : on relit ses composantes locales.
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isoDay(value: string | undefined): string | null {
  if (!value) return null;
  const day = value.trim().slice(0, 10);
  return ISO_DAY.test(day) ? day : null;
}

export function parseGovernmentCSV(csvText: string): GouvernementCSV[] {
  return parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter: ";",
    bom: true,
  }) as GouvernementCSV[];
}

async function fetchGovernmentCSV(): Promise<GouvernementCSV[]> {
  console.log(`Fetching government data from: ${DATA_GOUV_CSV_URL}`);
  const { data: csvText } = await client.getText(DATA_GOUV_CSV_URL);
  const records = parseGovernmentCSV(csvText);
  console.log(`Parsed ${records.length} government member records`);
  return records;
}

function isCurrentRecord(r: GouvernementCSV): boolean {
  return !r.date_fin_fonction || r.date_fin_fonction.trim() === "";
}

function getMandateType(code: string): MandateType {
  switch (GOUV_FUNCTION_MAPPING[code]) {
    case "PREMIER_MINISTRE":
      return MandateType.PREMIER_MINISTRE;
    case "MINISTRE_DELEGUE":
      return MandateType.MINISTRE_DELEGUE;
    case "SECRETAIRE_ETAT":
      return MandateType.SECRETAIRE_ETAT;
    default:
      return MandateType.MINISTRE;
  }
}

export function recordKey(r: GouvernementCSV): string {
  return `${r.id}|${r.prenom}|${r.nom}`;
}

const politicianSelect = {
  id: true,
  slug: true,
  fullName: true,
  firstName: true,
  lastName: true,
  civility: true,
  birthDate: true,
  externalIds: { where: { source: DataSource.GOUVERNEMENT }, select: { externalId: true } },
  mandates: {
    select: {
      id: true,
      type: true,
      title: true,
      institution: true,
      startDate: true,
      endDate: true,
      isCurrent: true,
      source: true,
      sourceUrl: true,
      officialUrl: true,
      externalId: true,
      governmentData: {
        select: {
          governmentName: true,
          governmentId: true,
          startEvidence: true,
          endEvidence: true,
        },
      },
    },
  },
} as const;

type SelectedPolitician = {
  id: string;
  slug: string;
  fullName: string;
  firstName: string;
  lastName: string;
  civility: string | null;
  birthDate: Date | null;
  externalIds: Array<{ externalId: string }>;
  mandates: ExistingFunction[];
};

function toExisting(p: SelectedPolitician | null | undefined): ExistingPolitician | null {
  if (!p) return null;
  const { externalIds, ...rest } = p;
  return { ...rest, gouvExternalIds: externalIds.map((e) => e.externalId) };
}

async function findPoliticianForRecord(member: GouvernementCSV) {
  const slug = generateSlug(`${member.prenom}-${member.nom}`);
  const byName = {
    firstName: { equals: member.prenom, mode: "insensitive" as const },
    lastName: { equals: member.nom, mode: "insensitive" as const },
  };
  const byExtId = await db.externalId.findFirst({
    where: {
      source: DataSource.GOUVERNEMENT,
      externalId: { startsWith: `gouv-${member.id}-` },
      politician: { OR: [{ slug }, byName] },
    },
    select: { politician: { select: politicianSelect } },
  });
  if (byExtId?.politician) return toExisting(byExtId.politician);
  const bySlug = await db.politician.findUnique({ where: { slug }, select: politicianSelect });
  if (bySlug) return toExisting(bySlug);
  return toExisting(await db.politician.findFirst({ where: byName, select: politicianSelect }));
}

function readCorrections(correctionsPath: string): GovernmentCorrections | null {
  if (!fs.existsSync(correctionsPath)) return null;
  return safeJsonParseOrThrow<GovernmentCorrections>(fs.readFileSync(correctionsPath, "utf-8"));
}

/** Toutes les lectures du sync (source, base, fichier de corrections). Aucune écriture. */
export async function loadSyncInput(
  options: { currentOnly?: boolean; correctionsPath?: string } = {}
): Promise<SyncInput> {
  const currentOnly = options.currentOnly ?? true;
  const allRecords = await fetchGovernmentCSV();
  const records = currentOnly ? allRecords.filter(isCurrentRecord) : allRecords;
  const published = confirmedFromResourceUrl(DATA_GOUV_CSV_URL);

  const governments = await db.government.findMany({
    select: { id: true, slug: true, name: true },
  });
  const inOfficeRow = await db.government.findFirst({
    where: { endedAt: null },
    orderBy: { sequence: "desc" },
    select: { slug: true, compositionVerifiedAt: true },
  });

  const politicianByRecord = new Map<string, ExistingPolitician | null>();
  for (const r of records) {
    politicianByRecord.set(recordKey(r), await findPoliticianForRecord(r));
  }

  const current = await db.mandate.findMany({
    where: { type: { in: GOVERNMENT_FUNCTION_TYPES }, isCurrent: true },
    select: {
      type: true,
      politicianId: true,
      politician: { select: { slug: true, fullName: true } },
      governmentData: { select: { governmentName: true } },
    },
  });

  const corrections = readCorrections(options.correctionsPath ?? CORRECTIONS_FILE);
  const politiciansByFullName = new Map<string, ExistingPolitician[]>();
  const politicianByNewMemberSlug = new Map<string, ExistingPolitician | null>();
  const partyIdByName = new Map<string, string | null>();
  if (corrections) {
    const names = [
      ...(corrections.endMandates ?? []).map((e) => e.politicianName),
      ...(corrections.updateMembers ?? []).map((u) => u.politicianName),
    ].filter((n): n is string => Boolean(n));
    for (const name of names) {
      const key = name.toLowerCase();
      if (politiciansByFullName.has(key)) continue;
      const found = await db.politician.findMany({
        where: { fullName: { equals: name, mode: "insensitive" } },
        select: politicianSelect,
      });
      politiciansByFullName.set(
        key,
        found.map((p) => toExisting(p)!)
      );
    }
    for (const m of corrections.newMembers ?? []) {
      if (!m.firstName) continue;
      const slug = generateSlug(`${m.firstName}-${m.lastName}`);
      let found = await db.politician.findUnique({ where: { slug }, select: politicianSelect });
      if (!found) {
        found = await db.politician.findFirst({
          where: {
            firstName: { equals: m.firstName, mode: "insensitive" },
            lastName: { equals: m.lastName, mode: "insensitive" },
          },
          select: politicianSelect,
        });
      }
      politicianByNewMemberSlug.set(slug, toExisting(found));
      if (m.party && !partyIdByName.has(m.party)) {
        const party = await db.party.findFirst({
          where: {
            OR: [
              { name: { contains: m.party, mode: "insensitive" } },
              { shortName: { equals: m.party, mode: "insensitive" } },
            ],
          },
          select: { id: true },
        });
        partyIdByName.set(m.party, party?.id ?? null);
      }
    }
  }

  return {
    currentOnly,
    records,
    sourcePublishedDay: published ? published.toISOString().slice(0, 10) : null,
    governments,
    inOffice: inOfficeRow
      ? {
          slug: inOfficeRow.slug,
          compositionVerifiedDay: inOfficeRow.compositionVerifiedAt
            ? inOfficeRow.compositionVerifiedAt.toISOString().slice(0, 10)
            : null,
        }
      : null,
    politicianByRecord,
    currentFunctions: current.map((m) => ({
      politicianId: m.politicianId,
      politicianSlug: m.politician.slug,
      fullName: m.politician.fullName,
      type: m.type,
      governmentName: m.governmentData?.governmentName ?? null,
    })),
    corrections,
    politiciansByFullName,
    politicianByNewMemberSlug,
    partyIdByName,
  };
}

// ── Décisions (pures) ─────────────────────────────────────────────────────

function isActVerified(m: ExistingFunction): boolean {
  return m.governmentData?.startEvidence === "ACT" || m.governmentData?.endEvidence === "ACT";
}

function functionLabel(fullName: string, m: { type: MandateType; title: string }, day: string) {
  return `${fullName} : ${m.title} (${m.type}, depuis le ${day})`;
}

/** Une source est périmée si elle est antérieure à la composition vérifiée en exercice. */
function staleAgainst(
  sourceDay: string | null,
  inOffice: SyncInput["inOffice"]
): string | null | false {
  const verified = inOffice?.compositionVerifiedDay;
  if (!verified) return false;
  if (!sourceDay || sourceDay < verified) return verified;
  return false;
}

export function planSync(input: SyncInput): SyncPlan {
  const plan = emptyPlan();
  const govIdBySlug = new Map(input.governments.map((g) => [g.slug, g.id]));
  const govIdByName = new Map(input.governments.map((g) => [g.name, g.id]));
  const unresolved = new Set<string>();

  const resolveGovernment = (label: string): string | null => {
    const trimmed = label.trim();
    const slug = governmentSlugForLegacyName(trimmed);
    const id = (slug ? govIdBySlug.get(slug) : undefined) ?? govIdByName.get(trimmed) ?? null;
    if (!id) unresolved.add(trimmed);
    return id;
  };

  // Fonctions prévues par personne existante, pour ne pas créer deux fois la même.
  const planned = new Map<string, Array<{ type: MandateType; startDay: string }>>();
  const plannedNew = new Set<string>();
  const sameFunction = (
    a: { type: MandateType; startDay: string },
    type: MandateType,
    day: string
  ) => a.type === type && Math.abs(Date.parse(a.startDay) - Date.parse(day)) < 3 * 86_400_000;

  // 1. CSV
  const csvStale = staleAgainst(input.sourcePublishedDay, input.inOffice);
  if (csvStale) {
    plan.staleSources.push(
      `CSV data.gouv publié le ${input.sourcePublishedDay ?? "?"}, antérieur à la composition vérifiée de ${input.inOffice?.slug} (${csvStale}) : fonctions en cours ignorées`
    );
  }
  const matchedPoliticianIds = new Set<string>();
  const matchedSlugs = new Set<string>();

  for (const member of input.records) {
    const fullName = `${member.prenom} ${member.nom}`;
    const slug = generateSlug(`${member.prenom}-${member.nom}`);
    const existing = input.politicianByRecord.get(recordKey(member)) ?? null;
    matchedSlugs.add(slug);
    if (existing) matchedPoliticianIds.add(existing.id);

    if (csvStale && isCurrentRecord(member)) continue;

    const startDay = parseFrenchDay(member.date_debut_fonction);
    const endDay = parseFrenchDay(member.date_fin_fonction);
    if (!startDay) {
      plan.errors.push(`Date de début illisible pour ${fullName} : ${member.date_debut_fonction}`);
      continue;
    }
    const type = getMandateType(member.code_fonction);
    const externalId = `gouv-${member.id}-${member.code_fonction}-${startDay}`;
    const governmentName = `Gouvernement ${member.gouvernement}`;
    const fn: PlannedFunction = {
      type,
      title: sanitizeGovernmentTitle(member.fonction),
      institution: governmentName,
      startDay,
      endDay,
      isCurrent: !endDay,
      source: DataSource.GOUVERNEMENT,
      sourceUrl: COMPOSITION_URL,
      officialUrl: COMPOSITION_URL,
      externalId,
      governmentName,
      governmentId: resolveGovernment(governmentName),
      startEvidence: "DATASET",
      endEvidence: endDay ? "DATASET" : null,
    };
    const label = functionLabel(fullName, fn, startDay);

    if (!existing) {
      if (plannedNew.has(`${slug}|${type}|${startDay}`)) continue;
      plannedNew.add(`${slug}|${type}|${startDay}`);
      plan.creates.push({
        label,
        politician: {
          kind: "new",
          data: {
            slug,
            firstName: member.prenom,
            lastName: member.nom,
            fullName,
            civility: null,
            birthDay: null,
            partyId: null,
          },
        },
        mandate: fn,
        externalId,
      });
      continue;
    }

    const match =
      existing.mandates.find((m) => m.externalId === externalId) ??
      existing.mandates.find((m) =>
        sameFunction({ type: m.type, startDay: parisDay(m.startDate) }, type, startDay)
      );

    if (!match) {
      const already = planned.get(existing.id) ?? [];
      if (already.some((p) => sameFunction(p, type, startDay))) continue;
      planned.set(existing.id, [...already, { type, startDay }]);
      plan.creates.push({
        label,
        politician: { kind: "existing", id: existing.id },
        mandate: fn,
        externalId,
      });
      continue;
    }

    if (isActVerified(match)) {
      plan.skippedActVerified.push(label);
      continue;
    }

    planFunctionUpdate(plan, match, fn, label);
    if (!existing.gouvExternalIds.includes(externalId)) {
      plan.links.push({ kind: "externalId", label, politicianId: existing.id, externalId });
    }
  }

  // 2. Fonctions en cours absentes de la source : à vérifier, jamais closes.
  if (input.currentOnly && !csvStale && input.records.length > 0) {
    for (const f of input.currentFunctions) {
      if (matchedPoliticianIds.has(f.politicianId) || matchedSlugs.has(f.politicianSlug)) continue;
      plan.toVerify.push(
        `${f.fullName} (${f.type}, ${f.governmentName ?? "sans gouvernement"}) : en cours dans la base, absente de la source`
      );
    }
  }

  // 3. Corrections locales
  if (input.corrections) {
    planCorrections(plan, input, resolveGovernment);
  }

  plan.unresolvedLabels = [...unresolved].sort();
  return plan;
}

function planFunctionUpdate(
  plan: SyncPlan,
  match: ExistingFunction,
  fn: PlannedFunction,
  label: string
) {
  const changes: MandateChanges = {};
  const current = {
    type: match.type,
    title: match.title,
    institution: match.institution,
    startDay: parisDay(match.startDate),
    endDay: match.endDate ? parisDay(match.endDate) : null,
    isCurrent: match.isCurrent,
    source: match.source,
    sourceUrl: match.sourceUrl,
    officialUrl: match.officialUrl,
    externalId: match.externalId,
  };
  for (const key of [
    "type",
    "title",
    "institution",
    "startDay",
    "source",
    "sourceUrl",
    "officialUrl",
    "externalId",
  ] as const) {
    if (current[key] !== fn[key]) Object.assign(changes, { [key]: fn[key] });
  }
  if (current.endDay !== null && fn.endDay === null) {
    // La source dit « en cours », la base dit « close » : on ne rouvre jamais.
    plan.toVerify.push(
      `${label} : close le ${current.endDay} dans la base, en cours dans la source`
    );
  } else {
    if (current.endDay !== fn.endDay) changes.endDay = fn.endDay;
    if (current.isCurrent !== fn.isCurrent) changes.isCurrent = fn.isCurrent;
  }

  const gd = match.governmentData;
  // Le libellé n'est réécrit que sur une fonction pas encore rattachée à un `Government`.
  let governmentName: string | undefined;
  if (!gd) governmentName = fn.governmentName;
  else if (gd.governmentId === null && gd.governmentName !== fn.governmentName) {
    governmentName = fn.governmentName;
  }

  if (Object.keys(changes).length > 0 || governmentName !== undefined) {
    plan.updates.push({
      kind: "mandate",
      label,
      mandateId: match.id,
      changes,
      governmentName,
      startEvidence: changes.startDay ? "DATASET" : undefined,
      endEvidence: changes.endDay ? "DATASET" : undefined,
    });
  }
  if (fn.governmentId && !gd?.governmentId) {
    plan.links.push({
      kind: "government",
      label,
      mandateId: match.id,
      governmentId: fn.governmentId,
    });
  }
}

function planCorrections(
  plan: SyncPlan,
  input: SyncInput,
  resolveGovernment: (label: string) => string | null
) {
  const corrections = input.corrections!;
  const stale = staleAgainst(isoDay(corrections._updated), input.inOffice);
  if (stale) {
    plan.staleSources.push(
      `Corrections locales mises à jour le ${corrections._updated ?? "?"}, antérieures à la composition vérifiée de ${input.inOffice?.slug} (${stale}) : ignorées`
    );
    return;
  }

  // endMandates : clôture avec la date du fichier, jamais sur une fonction prouvée par un acte.
  for (const e of corrections.endMandates ?? []) {
    if (!e.politicianName) continue;
    const endDay = isoDay(e.endDate);
    if (!endDay) {
      plan.errors.push(`Correction sans date de fin lisible : ${e.politicianName}`);
      continue;
    }
    const people = input.politiciansByFullName.get(e.politicianName.toLowerCase()) ?? [];
    if (people.length === 0) {
      plan.errors.push(`Politician not found: ${e.politicianName}`);
      continue;
    }
    for (const p of people) {
      for (const m of p.mandates) {
        if (m.type !== e.mandateType || !m.isCurrent) continue;
        const label = functionLabel(p.fullName, m, parisDay(m.startDate));
        if (isActVerified(m)) {
          plan.skippedActVerified.push(label);
          continue;
        }
        plan.updates.push({
          kind: "mandate",
          label: `${label} : clôture au ${endDay}`,
          mandateId: m.id,
          changes: { endDay, isCurrent: false },
        });
      }
    }
  }

  // newMembers : création seulement ; une fonction close n'est jamais rouverte.
  for (const n of corrections.newMembers ?? []) {
    if (!n.firstName) continue;
    const slug = generateSlug(`${n.firstName}-${n.lastName}`);
    const startDay = isoDay(n.mandate.startDate);
    if (!startDay) {
      plan.errors.push(`Correction sans date de début lisible : ${n.fullName}`);
      continue;
    }
    const type = n.mandate.type as MandateType;
    const governmentName = `Gouvernement ${n.mandate.government}`;
    const fn: PlannedFunction = {
      type,
      title: n.mandate.title,
      institution: governmentName,
      startDay,
      endDay: null,
      isCurrent: true,
      source: DataSource.GOUVERNEMENT,
      sourceUrl: COMPOSITION_URL,
      officialUrl: COMPOSITION_URL,
      externalId: null,
      governmentName,
      governmentId: resolveGovernment(governmentName),
      startEvidence: null,
      endEvidence: null,
    };
    const label = functionLabel(n.fullName, fn, startDay);
    const existing = input.politicianByNewMemberSlug.get(slug) ?? null;
    if (!existing) {
      plan.creates.push({
        label,
        politician: {
          kind: "new",
          data: {
            slug,
            firstName: n.firstName,
            lastName: n.lastName,
            fullName: n.fullName,
            civility: n.civility ?? null,
            birthDay: isoDay(n.birthDate),
            partyId: n.party ? (input.partyIdByName.get(n.party) ?? null) : null,
          },
        },
        mandate: fn,
        externalId: null,
      });
      continue;
    }
    const match = existing.mandates.find(
      (m) => m.type === type && parisDay(m.startDate) === startDay
    );
    if (!match) {
      plan.creates.push({
        label,
        politician: { kind: "existing", id: existing.id },
        mandate: fn,
        externalId: null,
      });
    } else if (isActVerified(match)) {
      plan.skippedActVerified.push(label);
    } else if (!match.isCurrent) {
      plan.toVerify.push(
        `${label} : close dans la base, présente dans les corrections (non rouverte)`
      );
    }
  }

  // updateMembers : champs d'identité de la liste blanche uniquement.
  for (const u of corrections.updateMembers ?? []) {
    if (u._disabled) continue;
    const forbidden = Object.keys(u.updates).filter(
      (k) => !(UPDATE_MEMBER_ALLOWED_FIELDS as readonly string[]).includes(k)
    );
    if (forbidden.length > 0) {
      plan.errors.push(
        `Correction refusée pour ${u.politicianName} : champs non autorisés (${forbidden.join(", ")})`
      );
      continue;
    }
    const people = input.politiciansByFullName.get(u.politicianName.toLowerCase()) ?? [];
    for (const p of people) {
      const data: Partial<Record<AllowedIdentityField, string | null>> = {};
      for (const [key, raw] of Object.entries(u.updates) as Array<
        [AllowedIdentityField, unknown]
      >) {
        const value = raw === null ? null : String(raw);
        const now =
          key === "birthDate"
            ? p.birthDate
              ? p.birthDate.toISOString().slice(0, 10)
              : null
            : p[key];
        const next = key === "birthDate" ? isoDay(value ?? undefined) : value;
        if (now !== next) data[key] = next;
      }
      if (Object.keys(data).length > 0) {
        plan.updates.push({ kind: "politician", label: p.fullName, politicianId: p.id, data });
      }
    }
  }
}

// ── Écritures ─────────────────────────────────────────────────────────────

type Db = typeof db;

function mandateData(fn: PlannedFunction) {
  return {
    type: fn.type,
    title: fn.title,
    institution: fn.institution,
    startDate: parisMidnight(fn.startDay),
    endDate: fn.endDay ? parisMidnight(fn.endDay) : null,
    isCurrent: fn.isCurrent,
    source: fn.source,
    sourceUrl: fn.sourceUrl,
    officialUrl: fn.officialUrl,
    externalId: fn.externalId,
  };
}

function changesData(c: MandateChanges) {
  const { startDay, endDay, ...rest } = c;
  return {
    ...rest,
    ...(startDay !== undefined ? { startDate: parisMidnight(startDay) } : {}),
    ...(endDay !== undefined ? { endDate: endDay ? parisMidnight(endDay) : null } : {}),
  };
}

export async function applySync(
  plan: SyncPlan,
  client: Db = db
): Promise<
  Pick<GouvernementSyncResult, "membersCreated" | "membersUpdated" | "mandatesCreated" | "errors">
> {
  const out = { membersCreated: 0, membersUpdated: 0, mandatesCreated: 0, errors: [] as string[] };
  const createdBySlug = new Map<string, string>();

  for (const op of plan.creates) {
    try {
      let politicianId: string;
      if (op.politician.kind === "existing") {
        politicianId = op.politician.id;
      } else {
        const data = op.politician.data;
        const known = createdBySlug.get(data.slug);
        if (known) {
          politicianId = known;
        } else {
          const created = await client.politician.create({
            data: {
              slug: data.slug,
              firstName: data.firstName,
              lastName: data.lastName,
              fullName: data.fullName,
              civility: data.civility,
              birthDate: data.birthDay ? new Date(`${data.birthDay}T00:00:00Z`) : null,
            },
          });
          politicianId = created.id;
          createdBySlug.set(data.slug, politicianId);
          out.membersCreated++;
          if (data.partyId) await politicianService.setCurrentParty(politicianId, data.partyId);
        }
      }
      const fn = op.mandate;
      await client.mandate.create({
        data: {
          ...mandateData(fn),
          politicianId,
          governmentData: {
            create: {
              governmentName: fn.governmentName,
              governmentId: fn.governmentId,
              startEvidence: fn.startEvidence,
              endEvidence: fn.endEvidence,
            },
          },
        },
      });
      out.mandatesCreated++;
      if (op.externalId) {
        await client.externalId.upsert({
          where: {
            source_externalId: { source: DataSource.GOUVERNEMENT, externalId: op.externalId },
          },
          create: {
            politicianId,
            source: DataSource.GOUVERNEMENT,
            externalId: op.externalId,
            url: COMPOSITION_URL,
          },
          update: { politicianId, url: COMPOSITION_URL },
        });
      }
    } catch (e) {
      out.errors.push(`${op.label} : ${e}`);
    }
  }

  for (const op of plan.updates) {
    try {
      if (op.kind === "politician") {
        const { birthDate, ...rest } = op.data;
        await client.politician.update({
          where: { id: op.politicianId },
          data: {
            ...rest,
            ...(birthDate !== undefined
              ? { birthDate: birthDate ? new Date(`${birthDate}T00:00:00Z`) : null }
              : {}),
          } as Record<string, unknown>,
        });
      } else {
        const evidence = {
          ...(op.startEvidence ? { startEvidence: op.startEvidence } : {}),
          ...(op.endEvidence ? { endEvidence: op.endEvidence } : {}),
        };
        const touchesGovernment =
          op.governmentName !== undefined || Object.keys(evidence).length > 0;
        await client.mandate.update({
          where: { id: op.mandateId },
          data: {
            ...changesData(op.changes),
            ...(touchesGovernment
              ? {
                  governmentData: {
                    upsert: {
                      create: { governmentName: op.governmentName ?? "", ...evidence },
                      update: {
                        ...(op.governmentName !== undefined
                          ? { governmentName: op.governmentName }
                          : {}),
                        ...evidence,
                      },
                    },
                  },
                }
              : {}),
          },
        });
      }
      out.membersUpdated++;
    } catch (e) {
      out.errors.push(`${op.label} : ${e}`);
    }
  }

  for (const op of plan.links) {
    try {
      if (op.kind === "government") {
        await client.mandateGovernment.update({
          where: { mandateId: op.mandateId },
          data: { governmentId: op.governmentId },
        });
      } else {
        await client.externalId.upsert({
          where: {
            source_externalId: { source: DataSource.GOUVERNEMENT, externalId: op.externalId },
          },
          create: {
            politicianId: op.politicianId,
            source: DataSource.GOUVERNEMENT,
            externalId: op.externalId,
            url: COMPOSITION_URL,
          },
          update: { politicianId: op.politicianId, url: COMPOSITION_URL },
        });
      }
    } catch (e) {
      out.errors.push(`${op.label} : ${e}`);
    }
  }

  return out;
}

/** Résumé lisible du plan, imprimé en dry-run comme en exécution réelle. */
export function formatSyncPlan(plan: SyncPlan): string {
  const lines: string[] = [];
  const section = (title: string, items: string[]) => {
    lines.push(`${title} : ${items.length}`);
    for (const item of items) lines.push(`  - ${item}`);
  };
  section("Sources écartées (périmées)", plan.staleSources);
  section(
    "Créations",
    plan.creates.map((c) => c.label)
  );
  section(
    "Mises à jour",
    plan.updates.map((u) =>
      u.kind === "mandate"
        ? `${u.label} ${JSON.stringify(u.changes)}${u.governmentName !== undefined ? ` gouvernement=${u.governmentName}` : ""}`
        : `${u.label} ${JSON.stringify(u.data)}`
    )
  );
  section(
    "Rattachements",
    plan.links.map((l) =>
      l.kind === "government"
        ? `${l.label} -> gouvernement ${l.governmentId}`
        : `${l.label} -> ${l.externalId}`
    )
  );
  section("À vérifier (jamais clos par le sync)", plan.toVerify);
  section("Libellés sans gouvernement", plan.unresolvedLabels);
  section("Fonctions prouvées par un acte, laissées intactes", plan.skippedActVerified);
  section("Erreurs", plan.errors);
  return lines.join("\n");
}

/**
 * Sync des membres du gouvernement depuis data.gouv.fr puis des corrections locales.
 * `dryRun` exécute les mêmes lectures et décisions, imprime le plan et n'écrit rien ;
 * il reste permis pendant le gel.
 */
export async function syncGouvernement(
  options: {
    currentOnly?: boolean;
    dryRun?: boolean;
    allowDuringGovernmentMigration?: boolean;
  } = {}
): Promise<GouvernementSyncResult & { plan: SyncPlan }> {
  const { currentOnly = true, dryRun = false } = options;

  if (GOVERNMENT_SYNC_FROZEN && !options.allowDuringGovernmentMigration && !dryRun) {
    console.log(
      "Sync gouvernement gelé pendant la migration des gouvernements (option --allow-during-government-migration pour forcer, --dry-run pour simuler)."
    );
    return {
      success: true,
      membersCreated: 0,
      membersUpdated: 0,
      mandatesCreated: 0,
      errors: [],
      skipped: "government-migration-freeze",
      plan: emptyPlan(),
    };
  }

  const result: GouvernementSyncResult & { plan: SyncPlan } = {
    success: false,
    membersCreated: 0,
    membersUpdated: 0,
    mandatesCreated: 0,
    errors: [],
    plan: emptyPlan(),
  };

  try {
    const input = await loadSyncInput({ currentOnly });
    const plan = planSync(input);
    result.plan = plan;
    result.errors.push(...plan.errors);
    console.log(`${dryRun ? "[DRY-RUN] " : ""}Plan du sync gouvernement\n${formatSyncPlan(plan)}`);

    if (!dryRun) {
      const applied = await applySync(plan);
      result.membersCreated = applied.membersCreated;
      result.membersUpdated = applied.membersUpdated;
      result.mandatesCreated = applied.mandatesCreated;
      result.errors.push(...applied.errors);
    }
    result.success = true;
  } catch (error) {
    result.errors.push(String(error));
    console.error("Sync failed:", error);
  }

  return result;
}
/**
 * Get government stats
 */
export async function getGouvernementStats() {
  const ministerTypes = [
    MandateType.PREMIER_MINISTRE,
    MandateType.MINISTRE,
    MandateType.MINISTRE_DELEGUE,
    MandateType.SECRETAIRE_ETAT,
  ];

  const [currentMembers, allMandates] = await Promise.all([
    db.mandate.count({
      where: {
        type: { in: ministerTypes },
        isCurrent: true,
      },
    }),
    db.mandate.count({
      where: {
        type: { in: ministerTypes },
      },
    }),
  ]);

  return {
    currentGovernmentMembers: currentMembers,
    totalGovernmentMandates: allMandates,
  };
}
