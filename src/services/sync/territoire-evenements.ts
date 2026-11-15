import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import { functionRank } from "@/lib/territoires/executif";
import {
  isEvenementSourceUrl,
  territoireEvenementSchema,
  type TerritoireEvenementPayload,
} from "@/lib/territoires/evenements";

/**
 * Producers of the "fil du territoire" (Territoires v2, lot B), called at the end of a sync.
 * Each builder turns a fact the sync has just established into an event draft; `recordEvenements`
 * writes them once. The sentence is not stored: it is rendered from the payload by a template.
 */

export interface EvenementDraft {
  territoryType: "COM" | "DEP" | "REG";
  territoryCode: string;
  /** Date of the fact. */
  occurredOn: Date;
  payload: TerritoireEvenementPayload;
  sourceLabel: string;
  sourceUrl: string;
  /** PUBLISHED only for a fact the site already shows; anything else is a draft to review. */
  status: "PUBLISHED" | "DRAFT";
  dedupeKey: string;
}

const RNE_SOURCE = {
  sourceLabel: "Répertoire national des élus, ministère de l'Intérieur",
  sourceUrl: "https://www.data.gouv.fr/datasets/repertoire-national-des-elus-1",
};

const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * A new mayor between two imports of the register. Published only when the site already names
 * that person as the mayor of the commune (`shownOnSite`), a draft otherwise.
 */
export function maireChangeEvenement(input: {
  inseeCode: string;
  nom: string;
  predecesseur: string | null;
  functionStart: Date;
  shownOnSite: boolean;
}): EvenementDraft {
  return {
    territoryType: "COM",
    territoryCode: input.inseeCode,
    occurredOn: input.functionStart,
    payload: { type: "CHANGEMENT_MAIRE", nom: input.nom, predecesseur: input.predecesseur },
    ...RNE_SOURCE,
    status: input.shownOnSite ? "PUBLISHED" : "DRAFT",
    dedupeKey: `maire:${input.inseeCode}:${day(input.functionStart)}`,
  };
}

/**
 * A new president of a departmental or regional council between two imports. The page of the
 * territory names the president the register lists, so the fact is public once imported.
 */
export function presidentChangeEvenement(input: {
  niveau: "DEPARTEMENTAL" | "REGIONAL";
  territoryCode: string;
  nom: string;
  predecesseur: string | null;
  functionStart: Date;
}): EvenementDraft {
  return {
    territoryType: input.niveau === "DEPARTEMENTAL" ? "DEP" : "REG",
    territoryCode: input.territoryCode,
    occurredOn: input.functionStart,
    payload: {
      type: "CHANGEMENT_PRESIDENT",
      conseil: input.niveau,
      nom: input.nom,
      predecesseur: input.predecesseur,
    },
    ...RNE_SOURCE,
    status: "PUBLISHED",
    dedupeKey: `president:${input.niveau}:${input.territoryCode}:${day(input.functionStart)}`,
  };
}

/** The results of one round imported for one commune: shown on its page from the import on. */
export function resultatElectionEvenement(input: {
  inseeCode: string;
  electionSlug: string;
  electionLabel: string;
  tour: 1 | 2;
  roundDate: Date;
  sourceLabel: string;
  sourceUrl: string;
}): EvenementDraft {
  return {
    territoryType: "COM",
    territoryCode: input.inseeCode,
    occurredOn: input.roundDate,
    payload: {
      type: "RESULTAT_ELECTION",
      electionSlug: input.electionSlug,
      electionLabel: input.electionLabel,
      tour: input.tour,
    },
    sourceLabel: input.sourceLabel,
    sourceUrl: input.sourceUrl,
    status: "PUBLISHED",
    dedupeKey: `resultat:${input.electionSlug}:${input.tour}:${input.inseeCode}`,
  };
}

const CHUNK = 1000;

/**
 * Writes the drafts that pass the schema of their type, once each (`dedupeKey`). Never throws:
 * the fil comes after the sync that feeds it and must not fail it, including while the table
 * does not exist yet.
 */
export async function recordEvenements(
  drafts: EvenementDraft[]
): Promise<{ written: number; rejected: number }> {
  const data: Prisma.TerritoireEvenementCreateManyInput[] = [];
  for (const draft of drafts) {
    const parsed = territoireEvenementSchema.safeParse(draft.payload);
    if (!parsed.success || !isEvenementSourceUrl(draft.sourceUrl)) continue;
    const { type, ...fields } = parsed.data;
    data.push({
      type,
      territoryType: draft.territoryType,
      territoryCode: draft.territoryCode,
      occurredOn: draft.occurredOn,
      payload: fields,
      sourceLabel: draft.sourceLabel,
      sourceUrl: draft.sourceUrl,
      status: draft.status,
      dedupeKey: draft.dedupeKey,
    });
  }
  const rejected = drafts.length - data.length;

  let written = 0;
  try {
    for (let i = 0; i < data.length; i += CHUNK) {
      const result = await db.territoireEvenement.createMany({
        data: data.slice(i, i + CHUNK),
        skipDuplicates: true,
      });
      written += result.count;
    }
  } catch (error) {
    console.warn(`[territoire-evenements] écriture interrompue après ${written} lignes :`, error);
  }
  return { written, rejected };
}

export interface PresidentLine {
  territoryCode: string;
  firstName: string;
  lastName: string;
  rowKey: string;
  functionLabel: string | null;
  functionStart: Date | null;
}

const sameWords = (a: string, b: string) =>
  a
    .normalize("NFD")
    .replace(/[^a-zA-Z]/g, "")
    .toLowerCase() ===
  b
    .normalize("NFD")
    .replace(/[^a-zA-Z]/g, "")
    .toLowerCase();

/**
 * Presidents that differ between the stored council lines and the file about to replace them.
 * Nothing on a first import (no previous line to compare), nothing when the register gives no
 * function start (the date of the fact is unknown), nothing when only the spelling changed.
 */
export function presidentChangeDrafts(
  niveau: "DEPARTEMENTAL" | "REGIONAL",
  stored: PresidentLine[],
  incoming: PresidentLine[]
): EvenementDraft[] {
  const head = (lines: PresidentLine[]) =>
    new Map(
      lines.filter((l) => functionRank(l.functionLabel) === 0).map((l) => [l.territoryCode, l])
    );
  const before = head(stored);
  const drafts: EvenementDraft[] = [];
  for (const [territoryCode, now] of head(incoming)) {
    const previous = before.get(territoryCode);
    if (!previous || previous.rowKey === now.rowKey || !now.functionStart) continue;
    const nom = `${now.firstName} ${now.lastName}`;
    const predecesseur = `${previous.firstName} ${previous.lastName}`;
    if (sameWords(nom, predecesseur)) continue;
    drafts.push(
      presidentChangeEvenement({
        niveau,
        territoryCode,
        nom,
        predecesseur,
        functionStart: now.functionStart,
      })
    );
  }
  return drafts;
}

export interface MaireChange {
  /** INSEE code, the key of `Commune`. */
  communeId: string;
  nom: string;
  predecesseur: string | null;
  functionStart: Date;
}

/**
 * The change to note when a register row replaces the mayor we held, or null. Nothing without
 * a function start: the start of the councillor mandate, or a default date, is not the day the
 * person became mayor, and an event is dated by its fact. Nothing without a known commune
 * either: there is no page to show it on.
 */
export function maireChange(
  row: { communeId: string | null; fullName: string; functionStart: Date | null },
  previous: { firstName: string | null; lastName: string | null }
): MaireChange | null {
  if (!row.communeId || !row.functionStart) return null;
  const predecesseur = `${previous.firstName ?? ""} ${previous.lastName ?? ""}`.trim();
  return {
    communeId: row.communeId,
    nom: row.fullName,
    predecesseur: predecesseur || null,
    functionStart: row.functionStart,
  };
}

/**
 * Drafts for the mayors a register import replaced. Read after the import has settled: a change
 * is published only when the commune now has exactly one current mayor and that profile is
 * public, which is the condition under which the commune page names a mayor.
 */
export async function maireChangeDrafts(changes: MaireChange[]): Promise<EvenementDraft[]> {
  if (changes.length === 0) return [];
  let holders: {
    localData: { communeId: string | null } | null;
    politician: { publicationStatus: string };
  }[] = [];
  try {
    holders = await db.mandate.findMany({
      where: {
        type: "MAIRE",
        isCurrent: true,
        localData: { communeId: { in: changes.map((c) => c.communeId) } },
      },
      select: {
        localData: { select: { communeId: true } },
        politician: { select: { publicationStatus: true } },
      },
    });
  } catch (error) {
    // Same promise as `recordEvenements`: the fil never fails the sync. Unread, every change
    // stays a draft.
    console.warn("[territoire-evenements] maires courants illisibles :", error);
  }
  const byCommune = new Map<string, string[]>();
  for (const h of holders) {
    const id = h.localData?.communeId;
    if (id) byCommune.set(id, [...(byCommune.get(id) ?? []), h.politician.publicationStatus]);
  }
  return changes.map((change) => {
    const statuses = byCommune.get(change.communeId) ?? [];
    return maireChangeEvenement({
      inseeCode: change.communeId,
      nom: change.nom,
      predecesseur: change.predecesseur,
      functionStart: change.functionStart,
      shownOnSite: statuses.length === 1 && statuses[0] === "PUBLISHED",
    });
  });
}
