import type { PolicyTitleConfidence, ScrutinType } from "@/generated/prisma";
import { assertLocalTestDb } from "@/test/db-guard";

// Shared fixtures for the getExplainedShowcase / getScrutins integration tests.
//
// Explicit ids (not cuid-generated) so tests can assert on them directly.
// - Dossiers A, B, C
// - dA1, dA2: dossier A, HIGH confidence, importance score 10, today
// - dB1: dossier B, HIGH confidence, importance score 5, today, type AMENDEMENT
//   (lets explainedOnly tests prove excludeType gets overridden)
// - low1: dossier C, LOW confidence, importance score 100 (proves LOW is
//   excluded from the showcase regardless of how high its score is)
const DOSSIER_IDS = ["A", "B", "C"] as const;
const SCRUTIN_FIXTURES: Array<{
  id: string;
  dossierId: (typeof DOSSIER_IDS)[number];
  confidence: PolicyTitleConfidence;
  score: number;
  type?: ScrutinType;
}> = [
  { id: "dA1", dossierId: "A", confidence: "HIGH", score: 10 },
  { id: "dA2", dossierId: "A", confidence: "HIGH", score: 10 },
  { id: "dB1", dossierId: "B", confidence: "HIGH", score: 5, type: "AMENDEMENT" },
  { id: "low1", dossierId: "C", confidence: "LOW", score: 100 },
];
const SCRUTIN_IDS = SCRUTIN_FIXTURES.map((s) => s.id);

/**
 * Deletes the shared fixtures above, children before parents, using the same
 * explicit id sets the seed uses. Exported so integration tests can call it
 * from an afterAll and leave no residue behind, even against a real DB.
 */
export async function cleanupExplainedFixtures(db: typeof import("@/lib/db").db): Promise<void> {
  assertLocalTestDb();

  await db.scrutinImportance.deleteMany({ where: { scrutinId: { in: SCRUTIN_IDS } } });
  await db.scrutinPolicyTitle.deleteMany({ where: { scrutinId: { in: SCRUTIN_IDS } } });
  await db.scrutin.deleteMany({ where: { id: { in: SCRUTIN_IDS } } });
  await db.legislativeDossier.deleteMany({ where: { id: { in: [...DOSSIER_IDS] } } });
}

/**
 * Seeds the fixtures above (idempotent: deletes any existing rows with these
 * explicit ids first, children before parents, so re-running never throws on
 * an FK conflict).
 */
export async function seedExplainedFixtures(db: typeof import("@/lib/db").db): Promise<void> {
  assertLocalTestDb();

  await cleanupExplainedFixtures(db);

  await db.legislativeDossier.createMany({
    data: DOSSIER_IDS.map((id) => ({
      id,
      externalId: `TEST_EXPL_DLR_${id}`,
      title: `Dossier test ${id}`,
      status: "EN_COURS",
    })),
  });

  const today = new Date();

  for (const s of SCRUTIN_FIXTURES) {
    await db.scrutin.create({
      data: {
        id: s.id,
        externalId: `TEST_EXPL_${s.id}`,
        title: `Scrutin test ${s.id}`,
        votingDate: today,
        legislature: 17,
        chamber: "AN",
        votesFor: 100,
        votesAgainst: 50,
        votesAbstain: 5,
        result: "ADOPTED",
        dossierLegislatifId: s.dossierId,
        ...(s.type && { type: s.type }),
        policyTitle: {
          create: {
            officialTitleSnapshot: `Snapshot ${s.id}`,
            inputHash: "0".repeat(64),
            policyTitle: `Titre politique ${s.id}`,
            proceduralLabel: "Scrutin solennel",
            confidence: s.confidence,
            qualitySignals: {},
            generationSource: "LLM",
            status: "APPROVED",
          },
        },
        importance: {
          create: {
            score: s.score,
            isKeyVote: false,
            signals: {},
          },
        },
      },
    });
  }
}
