/**
 * Fixtures for the lot 1 measures tests.
 *
 * No gate here: `@/test/db-guard` owns both `describeIfDisposableDb` (the block gate)
 * and `assertDisposableTestDb()` (the hard refusal these fixtures call). It parses the
 * URL instead of matching a substring, and narrows the single definition of "local"
 * down to the disposable container. Writing another one here would be a second
 * convention to keep in sync.
 */

import { assertDisposableTestDb } from "@/test/db-guard";
// TYPE-ONLY, and that matters: `../transitions` imports `@/lib/db` as a value, which
// throws at module load without DATABASE_URL. A value import here would fail every test
// file that imports these fixtures, before any gate could skip a block. A type import is
// erased at compile time, so it costs nothing.
import type { DraftMeasureRevisionInput } from "../transitions";

/** Deferred, for the same reason as client(): the module must not load at import time. */
async function transitions(): Promise<typeof import("../transitions")> {
  assertDisposableTestDb();
  return import("../transitions");
}

/**
 * Deferred client. `@/lib/db` throws `DATABASE_URL environment variable is not set` at
 * module load, so a top-level import would fail the whole suite instead of letting the
 * gated blocks skip. Fixtures are plain functions, not describe blocks, so they resolve
 * the client on each call rather than in a beforeAll.
 *
 * assertDisposableTestDb() is the second layer db-guard was written for: a fixture can
 * be called from a script or a future test that forgot the gate, and it must not depend
 * on its caller having been careful.
 */
async function client(): Promise<typeof import("@/lib/db").db> {
  assertDisposableTestDb();
  const { db } = await import("@/lib/db");
  return db;
}

// Fixed slugs collide on the second test of a block, and the failure reads like a
// logic bug instead of a fixture bug. These fixtures never clean up after themselves:
// the container is destroyed on harness exit, and cleaning measures only would leave
// their politicians and elections behind to collide anyway.
let sequence = 0;
export function uniqueSlug(prefix: string): string {
  sequence += 1;
  return `${prefix}-${process.pid}-${sequence}`;
}

// Required fields read off prisma/schema.prisma field by field, not guessed. Doing it
// the other way round costs one harness run per missing field, and each failure names
// the fixture rather than the omission:
//   Politician: slug, firstName, lastName, fullName.
//   Party: name AND shortName, both @unique, so both must vary per fixture.
//   Election: slug, type, title AND scope. There is no `name` and no `date` field, the
//     dates are round1Date and round2Date, both optional.
//   Candidacy: electionId and candidateName. politicianId is optional there.
//
// Creating any of these also allocates a publicId from a PostgreSQL sequence, through
// the extension in src/lib/db.ts. Those sequences are not in the datamodel, so
// docker/init-search.sql creates them: without that, every fixture here fails on
// `relation "poligraph_election_seq" does not exist`.
export async function seedPolitician(): Promise<string> {
  const db = await client();
  const slug = uniqueSlug("politicien");
  const row = await db.politician.create({
    data: {
      slug,
      firstName: "Prénom",
      lastName: slug,
      fullName: `Prénom ${slug}`,
      publicationStatus: "PUBLISHED",
    },
  });
  return row.id;
}

export async function seedParty(): Promise<string> {
  const db = await client();
  const slug = uniqueSlug("parti");
  const row = await db.party.create({
    data: { slug, name: `Parti ${slug}`, shortName: slug },
  });
  return row.id;
}

export async function seedElection(): Promise<string> {
  const db = await client();
  const slug = uniqueSlug("election");
  const row = await db.election.create({
    data: {
      slug,
      type: "PRESIDENTIELLE",
      scope: "NATIONAL",
      title: `Élection ${slug}`,
      round1Date: new Date("2027-04-11T00:00:00Z"),
    },
  });
  return row.id;
}

export async function seedCandidacy(politicianId: string, electionId: string): Promise<string> {
  const db = await client();
  const row = await db.candidacy.create({
    data: {
      electionId,
      politicianId,
      candidateName: `Candidat ${uniqueSlug("c")}`,
      status: "DECLARE",
      sourceUrl: "https://example.org/candidature",
      sourceLabel: "Annonce publique",
      presidentialData: { create: { publicationStatus: "PUBLISHED" } },
    },
  });
  return row.id;
}

// The three fixtures below are shared by every task from the editorial cycle onwards, so
// they live here rather than in one test file. Duplicating them means two definitions
// that drift, and a test that then passes for a reason nobody intended.

/** A measure with a single, never-published draft. The starting point of most scenarios. */
export async function seedMeasureWithDraft(): Promise<{ measureId: string; revisionId: string }> {
  const { createMeasure } = await transitions();
  const politicianId = await seedPolitician();
  const electionId = await seedElection();
  const candidacyId = await seedCandidacy(politicianId, electionId);
  return createMeasure({
    politicianId,
    electionId,
    candidacyId,
    programEditionId: null,
    attribution: "PERSONAL",
    theme: "LOGEMENT_URBANISME",
    precedingMeasureId: null,
    revision: {
      text: "Encadrer les loyers dans les zones tendues.",
      precision: "OBJECTIF_SANS_CHIFFRE",
      validFrom: new Date("2027-01-01T00:00:00Z"),
      extractionMethod: "MANUAL",
      extractionConfidence: null,
      extractorVersion: null,
    },
    sources: [
      {
        sourceKind: "DISCOURS_CAMPAGNE",
        tier: "PRIMARY",
        url: "https://example.org/meeting",
        page: null,
        publishedAt: new Date("2027-01-01T00:00:00Z"),
      },
    ],
  });
}

export function draftInput(measureId: string, text: string): DraftMeasureRevisionInput {
  return {
    measureId,
    revision: {
      text,
      precision: null,
      validFrom: new Date("2027-02-01T00:00:00Z"),
      extractionMethod: "MANUAL",
      extractionConfidence: null,
      extractorVersion: null,
    },
    sources: [
      {
        sourceKind: "ARTICLE_PRESSE",
        tier: "SECONDARY",
        url: "https://example.org/article",
        page: null,
        publishedAt: new Date("2027-02-01T00:00:00Z"),
      },
    ],
  };
}

/** A measure published through the real path: created, reviewed, then published. */
export async function publishSeededMeasure(): Promise<{ measureId: string; revisionId: string }> {
  const { publishMeasureRevision, reviewMeasureRevision } = await transitions();
  const seeded = await seedMeasureWithDraft();
  await reviewMeasureRevision({ ...seeded, reviewedBy: "relecteur" });
  await publishMeasureRevision(seeded);
  return seeded;
}

const REJECT_CONSTRAINT = "reject_measure_search_document_test";

/**
 * Runs `fn` while the database rejects every write to a MEASURE SearchDocument.
 *
 * The only way to observe atomicity. A test that reads the final state stays green if the
 * indexing is moved after the commit, because the rows would still be there; making the
 * indexing FAIL is what shows whether the rest of the transition rolled back with it.
 *
 * NOT VALID is required, not cosmetic: earlier tests of the same run have already written
 * MEASURE documents, and without it the ALTER TABLE would fail on them instead of arming
 * the guard.
 */
export async function withIndexingRejected<T>(fn: () => Promise<T>): Promise<T> {
  const db = await client();
  await db.$executeRaw`
    ALTER TABLE "SearchDocument"
    ADD CONSTRAINT "reject_measure_search_document_test"
    CHECK ("entityType" <> 'MEASURE'::"SearchEntityType") NOT VALID
  `;
  try {
    return await fn();
  } finally {
    await db.$executeRaw`
      ALTER TABLE "SearchDocument" DROP CONSTRAINT IF EXISTS "reject_measure_search_document_test"
    `;
  }
}

// Named export of the constraint name so a failing test can be diagnosed without
// searching for the string.
export const INDEXING_REJECT_CONSTRAINT = REJECT_CONSTRAINT;
