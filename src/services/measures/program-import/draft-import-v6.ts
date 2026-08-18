import { createHash } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertHubMeasureCandidacy } from "@/app/admin/mesures/_data/candidacy-eligibility";
import { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { createMeasure } from "@/lib/measures/transitions";
import { jaccardSimilarity, normalizeForDeduplication } from "./deduplication";
import {
  evidenceSnapshotV3Schema,
  isDraftablePreparedCandidate,
  type DraftablePreparedMeasureCandidate,
  type PreparedMeasureCandidate,
  type ReviewWarning,
} from "./evidence-v6";
import { runV6ShadowImport, type V6ShadowOptions, type V6ShadowReport } from "./shadow-v6";

const REVIEW_METADATA_MIGRATION =
  "prisma/migrations/20260818113000_add_measure_import_review_metadata/migration.sql";
const RUFFIN_SLUG = "francois-ruffin";

export type V6DraftImportOptions = V6ShadowOptions & {
  apply: boolean;
  confirmDraftWrite: boolean;
  /** Replans a frozen shadow report without revealing or calling the LLM again. */
  shadowReport?: V6ShadowReport;
};

export type V6DraftPlanItem = {
  proposalId: string;
  candidate: DraftablePreparedMeasureCandidate;
  databaseState: "NEW" | "ALREADY_EXISTS";
};

export type V6DraftImportReport = {
  generatedAt: string;
  mode: "dry-run" | "apply";
  shadow: V6ShadowReport;
  counts: {
    extracted: number;
    readyForReview: number;
    reviewWithWarning: number;
    technicallyBlocked: number;
    possibleDuplicates: number;
    alreadyExisting: number;
    wouldCreateDrafts: number;
    draftsCreated: number;
  };
  safety: {
    localMigrationAvailable: boolean;
    targetSchemaCompatible: boolean;
    validSnapshots: number;
    invalidSnapshots: number;
    automaticPublication: false;
    destructiveUpdates: false;
    productionModified: boolean;
  };
  targetSchemaError: string | null;
  created: Array<{ measureId: string; revisionId: string }>;
  items: V6DraftPlanItem[];
};

function withWarning(
  candidate: DraftablePreparedMeasureCandidate,
  warning: ReviewWarning
): DraftablePreparedMeasureCandidate {
  const warnings = candidate.warnings.includes(warning)
    ? candidate.warnings
    : [...candidate.warnings, warning];
  return {
    ...candidate,
    warnings,
    reviewReadiness: warnings.length > 0 ? "REVIEW_WITH_WARNING" : "READY_FOR_REVIEW",
  };
}

function flattenPrepared(report: V6ShadowReport): Array<{
  proposalId: string;
  prepared: PreparedMeasureCandidate;
}> {
  return report.editions.flatMap((edition) =>
    edition.proposals.map((proposal) => ({
      proposalId: proposal.id,
      prepared: proposal.preparedCandidate,
    }))
  );
}

async function targetReviewColumns(): Promise<Set<string>> {
  const rows = await db.$queryRaw<Array<{ column_name: string }>>(Prisma.sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'MeasureRevision'
      AND column_name IN (
        'evidenceSnapshot',
        'importFingerprint',
        'reviewReadiness',
        'reviewWarnings',
        'rejectedAt',
        'rejectedBy',
        'rejectionReason',
        'rejectionDetail'
      )
  `);
  return new Set(rows.map((row) => row.column_name));
}

const REQUIRED_TARGET_COLUMNS = [
  "evidenceSnapshot",
  "importFingerprint",
  "reviewReadiness",
  "reviewWarnings",
  "rejectedAt",
  "rejectedBy",
  "rejectionReason",
  "rejectionDetail",
] as const;

async function existingFingerprints(candidacyIds: string[]): Promise<Set<string>> {
  if (candidacyIds.length === 0) return new Set();
  const rows = await db.measureRevision.findMany({
    where: { measure: { candidacyId: { in: candidacyIds } }, importFingerprint: { not: null } },
    select: { importFingerprint: true },
  });
  return new Set(rows.flatMap((row) => (row.importFingerprint ? [row.importFingerprint] : [])));
}

async function existingTexts(candidacyIds: string[]) {
  if (candidacyIds.length === 0) return [];
  return db.measure.findMany({
    where: { candidacyId: { in: candidacyIds } },
    select: {
      candidacyId: true,
      theme: true,
      latestRevision: { select: { text: true } },
    },
  });
}

function renderDraftReport(report: V6DraftImportReport): string {
  return `# Préparation DRAFT V6\n\nGénéré le ${report.generatedAt}. Mode ${report.mode}.\n\nREADY_FOR_REVIEW signifie uniquement que la proposition est techniquement prête à être examinée par un humain. Ce statut ne valide ni la mesure, ni son exactitude éditoriale, ni sa publication.\n\n## Volumes\n\n- Extractions: ${report.counts.extracted}\n- READY_FOR_REVIEW: ${report.counts.readyForReview}\n- REVIEW_WITH_WARNING: ${report.counts.reviewWithWarning}\n- TECHNICALLY_BLOCKED: ${report.counts.technicallyBlocked}\n- Doublons possibles: ${report.counts.possibleDuplicates}\n- Déjà existants: ${report.counts.alreadyExisting}\n- DRAFTs qui seraient créés: ${report.counts.wouldCreateDrafts}\n- DRAFTs créés: ${report.counts.draftsCreated}\n\n## Sécurité\n\n- Migration locale: ${report.safety.localMigrationAvailable ? "OUI" : "NON"}\n- Schéma cible compatible: ${report.safety.targetSchemaCompatible ? "OUI" : "NON"}\n- Snapshots valides: ${report.safety.validSnapshots}\n- Snapshots invalides: ${report.safety.invalidSnapshots}\n- Publication automatique: NON\n- Mise à jour destructive: NON\n- Production modifiée: ${report.safety.productionModified ? "OUI" : "NON"}\n`;
}

async function writeDraftReport(report: V6DraftImportReport, reportDir: string): Promise<void> {
  await mkdir(reportDir, { recursive: true });
  await writeFile(
    path.join(reportDir, "presidentielle-2027-program-import-v6-drafts.json"),
    JSON.stringify(report, null, 2)
  );
  await writeFile(
    path.join(reportDir, "presidentielle-2027-program-import-v6-drafts.md"),
    renderDraftReport(report)
  );
}

export async function runV6DraftImport(
  options: V6DraftImportOptions
): Promise<V6DraftImportReport> {
  if (options.apply && !options.confirmDraftWrite) {
    throw new Error("L'apply V6 exige --confirm-draft-write après examen du dry-run.");
  }
  if (options.apply && options.candidate !== RUFFIN_SLUG) {
    throw new Error("Le premier apply V6 est limité explicitement au lot Ruffin.");
  }

  const shadow = options.shadowReport ?? (await runV6ShadowImport(options));
  const prepared = flattenPrepared(shadow);
  let localMigrationAvailable = true;
  try {
    await access(REVIEW_METADATA_MIGRATION);
  } catch {
    localMigrationAvailable = false;
  }

  let targetSchemaCompatible = false;
  let targetSchemaError: string | null = null;
  let fingerprints = new Set<string>();
  let databaseTexts: Awaited<ReturnType<typeof existingTexts>> = [];
  const draftable = prepared.filter(
    (item): item is { proposalId: string; prepared: DraftablePreparedMeasureCandidate } =>
      isDraftablePreparedCandidate(item.prepared)
  );
  const candidacyIds = [
    ...new Set(draftable.map((item) => item.prepared.draftContext.candidacyId)),
  ];
  try {
    const targetColumns = await targetReviewColumns();
    targetSchemaCompatible = REQUIRED_TARGET_COLUMNS.every((column) => targetColumns.has(column));
    databaseTexts = await existingTexts(candidacyIds);
    if (targetSchemaCompatible) {
      fingerprints = await existingFingerprints(candidacyIds);
    } else {
      targetSchemaError = "Le schéma cible ne porte pas toutes les colonnes de revue V6.";
    }
  } catch (error) {
    targetSchemaError = error instanceof Error ? error.message : String(error);
  }

  const items: V6DraftPlanItem[] = draftable.map(({ proposalId, prepared: original }) => {
    const exactDatabaseDuplicate = databaseTexts.some(
      (row) =>
        row.candidacyId === original.draftContext.candidacyId &&
        row.theme === original.theme &&
        row.latestRevision !== null &&
        normalizeForDeduplication(row.latestRevision.text) ===
          normalizeForDeduplication(original.formulation)
    );
    const possibleDatabaseDuplicate =
      !exactDatabaseDuplicate &&
      databaseTexts.some(
        (row) =>
          row.candidacyId === original.draftContext.candidacyId &&
          row.theme === original.theme &&
          row.latestRevision !== null &&
          jaccardSimilarity(row.latestRevision.text, original.formulation) >= 0.72
      );
    const candidate = possibleDatabaseDuplicate
      ? withWarning(original, "POSSIBLE_DUPLICATE")
      : original;
    return {
      proposalId,
      candidate,
      databaseState:
        fingerprints.has(candidate.importFingerprint) || exactDatabaseDuplicate
          ? "ALREADY_EXISTS"
          : "NEW",
    };
  });

  const newItems = items.filter((item) => item.databaseState === "NEW");
  const validSnapshots = draftable.filter(
    (item) => evidenceSnapshotV3Schema.safeParse(item.prepared.evidenceSnapshot).success
  ).length;
  const created: Array<{ measureId: string; revisionId: string }> = [];

  if (options.apply) {
    if (!localMigrationAvailable || !targetSchemaCompatible) {
      throw new Error(
        "L'apply V6 est bloqué tant que la migration locale et le schéma cible divergent."
      );
    }
    if (shadow.editions.length !== 3) {
      throw new Error("Le lot Ruffin doit contenir exactement trois éditions officielles.");
    }
    for (const item of newItems) {
      const candidate = item.candidate;
      const eligible = await assertHubMeasureCandidacy(candidate.draftContext.candidacyId);
      try {
        created.push(
          await createMeasure({
            politicianId: eligible.politicianId,
            electionId: eligible.electionId,
            candidacyId: candidate.draftContext.candidacyId,
            programEditionId: candidate.draftContext.programEditionId,
            attribution: "PERSONAL",
            theme: candidate.theme,
            precedingMeasureId: null,
            revision: {
              text: candidate.formulation,
              precision: candidate.draftContext.precision,
              validFrom: new Date(candidate.draftContext.validFrom),
              extractionMethod: "AI_ASSISTED",
              extractionConfidence: candidate.confidence,
              extractorVersion: candidate.draftContext.extractorVersion,
              importEngine: "V6",
              evidenceSnapshot: candidate.evidenceSnapshot,
              importFingerprint: candidate.importFingerprint,
              reviewReadiness: candidate.reviewReadiness,
              reviewWarnings: candidate.warnings,
            },
            sources: [
              {
                sourceKind: candidate.source.sourceKind,
                tier: candidate.source.tier,
                url: candidate.source.url,
                page: candidate.source.pages.join(", ") || null,
                publishedAt: new Date(candidate.source.publishedAt),
              },
            ],
          })
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          continue;
        }
        throw error;
      }
    }
  }

  const report: V6DraftImportReport = {
    generatedAt: new Date().toISOString(),
    mode: options.apply ? "apply" : "dry-run",
    shadow,
    counts: {
      extracted: prepared.length,
      readyForReview: items.filter((item) => item.candidate.reviewReadiness === "READY_FOR_REVIEW")
        .length,
      reviewWithWarning: items.filter(
        (item) => item.candidate.reviewReadiness === "REVIEW_WITH_WARNING"
      ).length,
      technicallyBlocked: prepared.length - draftable.length,
      possibleDuplicates: items.filter((item) =>
        item.candidate.warnings.includes("POSSIBLE_DUPLICATE")
      ).length,
      alreadyExisting: items.filter((item) => item.databaseState === "ALREADY_EXISTS").length,
      wouldCreateDrafts: newItems.length,
      draftsCreated: created.length,
    },
    safety: {
      localMigrationAvailable,
      targetSchemaCompatible,
      validSnapshots,
      invalidSnapshots: draftable.length - validSnapshots,
      automaticPublication: false,
      destructiveUpdates: false,
      productionModified: created.length > 0,
    },
    targetSchemaError,
    created,
    items,
  };
  const reportDir = options.reportDir ?? ".tmp/program-import/reports";
  await writeDraftReport(report, reportDir);
  return report;
}

export function stableDraftReportHash(report: V6DraftImportReport): string {
  return createHash("sha256").update(JSON.stringify(report.items)).digest("hex");
}
