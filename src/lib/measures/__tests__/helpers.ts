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
    data: { slug, firstName: "Prénom", lastName: slug, fullName: `Prénom ${slug}` },
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
    data: { electionId, politicianId, candidateName: `Candidat ${uniqueSlug("c")}` },
  });
  return row.id;
}
