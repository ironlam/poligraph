import type { MeasureSourceKind, PromiseSourceKind } from "@/generated/prisma";
import { db } from "@/lib/db";
import { isAllowedPresidentialMeasureTheme } from "@/lib/presidentielle/themes";
import { createMeasure } from "./transitions";

/**
 * Migrating the legacy `Promise` rows to the versioned measure model.
 *
 * Two facts shape this, and neither is negotiable:
 *
 * 1. **`Promise` has no election, `Measure` requires one.** A promise extracted from a press article
 *    says nothing about which campaign it belongs to, so the target election is given explicitly and
 *    only politicians who are candidates in it can be migrated. The rest are reported, not guessed.
 * 2. **A source with no URL cannot be migrated.** `Promise.sourceUrl` is nullable, `MeasureSource.url`
 *    is not. Inventing one would be worse than losing the row: a measure whose source cannot be
 *    checked is exactly what this project refuses to publish.
 *
 * Read-only on `Promise`: nothing here mutates the legacy rows. Retiring the model is a separate
 * `db:push`, after the code that stops using it has been deployed.
 */

/**
 * `PromiseSourceKind` has two values the measure enum deliberately does not:
 * `DECLARATION_PUBLIQUE` and `AUTRE`. The measure enum stays closed because the 60 % primary-source
 * threshold of spec 4.1 would stop being auditable if anything could count as primary.
 *
 * `DECLARATION_PUBLIQUE` maps onto `DISCOURS_CAMPAGNE`, which is what it described. `AUTRE` has no
 * honest target, so those rows are rejected with their reason.
 */
const SOURCE_KIND_MAP: Record<PromiseSourceKind, MeasureSourceKind | null> = {
  DISCOURS_AN: "DISCOURS_AN",
  DISCOURS_SENAT: "DISCOURS_SENAT",
  INTERVIEW_PRESSE: "INTERVIEW_PRESSE",
  ARTICLE_PRESSE: "ARTICLE_PRESSE",
  PROPOSITION_LOI: "PROPOSITION_LOI",
  PROGRAMME_PARTI: "PROGRAMME_PARTI",
  DECLARATION_PUBLIQUE: "DISCOURS_CAMPAGNE",
  AUTRE: null,
};

/** Primary sources are the ones that come from the candidate; press coverage is secondary. */
const PRIMARY_KINDS = new Set<MeasureSourceKind>([
  "PROGRAMME_PARTI",
  "DISCOURS_CAMPAGNE",
  "DEBAT_TELEVISE",
  "DISCOURS_AN",
  "DISCOURS_SENAT",
  "PROPOSITION_LOI",
]);

export type MigrationReject = {
  promiseId: string;
  reason: string;
};

export type MigrationReport = {
  electionId: string;
  dryRun: boolean;
  scanned: number;
  migrated: number;
  alreadyMigrated: number;
  rejects: MigrationReject[];
};

/**
 * The natural key for idempotence: a measure of the same politician, in the same election, carrying a
 * revision with the exact same text.
 *
 * No column added to `Measure` to record the origin, and that is a choice: a `promiseId` column would
 * outlive the model it names by years. The text is what the migration is about, so it is what
 * identifies an already-migrated row.
 */
async function alreadyMigrated(
  politicianId: string,
  electionId: string,
  text: string
): Promise<boolean> {
  const existing = await db.measure.findFirst({
    where: { politicianId, electionId, revisions: { some: { text } } },
    select: { id: true },
  });
  return existing !== null;
}

export async function migratePromisesToMeasures(input: {
  electionId: string;
  dryRun: boolean;
}): Promise<MigrationReport> {
  const election = await db.election.findUnique({
    where: { id: input.electionId },
    select: { id: true, slug: true },
  });
  if (election === null) {
    throw new Error(`Élection ${input.electionId} introuvable`);
  }

  const candidacies = await db.candidacy.findMany({
    where: { electionId: input.electionId, politicianId: { not: null } },
    select: { id: true, politicianId: true },
  });
  const candidacyByPolitician = new Map(
    candidacies.flatMap((c) => (c.politicianId === null ? [] : [[c.politicianId, c.id] as const]))
  );

  const promises = await db.promise.findMany({
    orderBy: { publishedAt: "asc" },
    select: {
      id: true,
      politicianId: true,
      text: true,
      theme: true,
      sourceKind: true,
      sourceUrl: true,
      publishedAt: true,
      extractionConfidence: true,
      extractionMethod: true,
    },
  });

  const report: MigrationReport = {
    electionId: input.electionId,
    dryRun: input.dryRun,
    scanned: promises.length,
    migrated: 0,
    alreadyMigrated: 0,
    rejects: [],
  };

  for (const promise of promises) {
    const candidacyId = candidacyByPolitician.get(promise.politicianId);
    if (candidacyId === undefined) {
      report.rejects.push({
        promiseId: promise.id,
        reason: "le politicien n'est pas candidat à cette élection",
      });
      continue;
    }

    const sourceKind = SOURCE_KIND_MAP[promise.sourceKind];
    if (sourceKind === null) {
      report.rejects.push({
        promiseId: promise.id,
        reason: `nature de source ${promise.sourceKind} sans équivalent dans l'enum des mesures`,
      });
      continue;
    }

    const url = (promise.sourceUrl ?? "").trim();
    if (url === "") {
      report.rejects.push({
        promiseId: promise.id,
        reason: "aucune URL de source, or une source de mesure en exige une",
      });
      continue;
    }

    if (promise.text.trim() === "") {
      report.rejects.push({ promiseId: promise.id, reason: "texte vide" });
      continue;
    }

    if (await alreadyMigrated(promise.politicianId, input.electionId, promise.text)) {
      report.alreadyMigrated += 1;
      continue;
    }

    if (!isAllowedPresidentialMeasureTheme(election.slug, promise.theme)) {
      report.rejects.push({
        promiseId: promise.id,
        reason: "thème historique à requalifier avant migration présidentielle",
      });
      continue;
    }

    if (input.dryRun) {
      report.migrated += 1;
      continue;
    }

    await createMeasure({
      politicianId: promise.politicianId,
      electionId: input.electionId,
      candidacyId,
      programEditionId: null,
      // Nothing in `Promise` records whether the person formulated it themselves, and the rows come
      // from press extraction about that person, so PERSONAL is what the data supports.
      attribution: "PERSONAL",
      theme: promise.theme,
      precedingMeasureId: null,
      revision: {
        text: promise.text,
        // `Promise` has no precision field. Leaving it unqualified is honest; guessing from the text
        // would be an editorial conclusion the migration is not entitled to draw.
        precision: null,
        validFrom: promise.publishedAt,
        extractionMethod: "IMPORTED",
        extractionConfidence: promise.extractionConfidence,
        extractorVersion: promise.extractionMethod,
      },
      sources: [
        {
          sourceKind,
          tier: PRIMARY_KINDS.has(sourceKind) ? "PRIMARY" : "SECONDARY",
          url,
          page: null,
          publishedAt: promise.publishedAt,
        },
      ],
    });
    report.migrated += 1;
  }

  return report;
}
