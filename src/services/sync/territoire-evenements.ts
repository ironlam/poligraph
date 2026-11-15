import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
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
