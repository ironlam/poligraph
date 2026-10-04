// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import type { PoliticianProfileDocument } from "../document";

let db: typeof import("@/lib/db").db;
let buildPoliticianProfileDocument: typeof import("../build").buildPoliticianProfileDocument;
let writeProfileSnapshot: typeof import("../store").writeProfileSnapshot;
let hashOf: (doc: PoliticianProfileDocument) => string;

const SLUG = "profile-snapshot-store";

const t = (seconds: number) => new Date(Date.UTC(2026, 9, 3, 12, 0, seconds));

async function storedHash(politicianId: string): Promise<string | undefined> {
  const row = await db.politicianProfileSnapshot.findUnique({ where: { politicianId } });
  return row?.contentHash;
}

describeIfDisposableDb("document de fiche politicien", () => {
  let deputeId: string;
  let politicianId: string;
  let docA: PoliticianProfileDocument;
  let docB: PoliticianProfileDocument;

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ buildPoliticianProfileDocument } = await import("../build"));
    ({ writeProfileSnapshot } = await import("../store"));
    const { serializeProfileDocument, hashSerializedDocument } = await import("../document");
    hashOf = (doc) => hashSerializedDocument(serializeProfileDocument(doc));

    await db.politician.deleteMany({ where: { slug: { startsWith: SLUG } } });
    const depute = await db.politician.create({
      data: {
        slug: `${SLUG}-depute`,
        firstName: "Camille",
        lastName: "Fictive",
        fullName: "Camille Fictive",
        publicationStatus: "PUBLISHED",
        mandates: {
          create: {
            type: "DEPUTE",
            title: "Député de la 1re circonscription de test",
            institution: "Assemblée nationale",
            startDate: new Date("2024-07-07T00:00:00.000Z"),
            isCurrent: true,
          },
        },
      },
    });
    deputeId = depute.id;
    politicianId = depute.id;

    const built = await buildPoliticianProfileDocument({ id: deputeId });
    if (!built) throw new Error("fixture: le document du député devrait se construire");
    docA = built;
    docB = { ...built, voteStats: null, mandateType: null };
  });

  beforeEach(async () => {
    await db.politicianProfileSnapshot.deleteMany({ where: { politicianId } });
  });

  afterAll(async () => {
    await db?.politician.deleteMany({ where: { slug: { startsWith: SLUG } } });
  });

  it("n'écrase pas un document construit plus tard", async () => {
    await writeProfileSnapshot({ politicianId, document: docA, startedAt: t(10) });
    const r = await writeProfileSnapshot({ politicianId, document: docB, startedAt: t(5) });
    expect(r).toEqual({ written: false, inserted: false, changed: false });
    expect(await storedHash(politicianId)).toBe(hashOf(docA));
  });

  it("signale « inchangé » quand le contenu est identique", async () => {
    await writeProfileSnapshot({ politicianId, document: docA, startedAt: t(1) });
    expect(await writeProfileSnapshot({ politicianId, document: docA, startedAt: t(2) })).toEqual({
      written: true,
      inserted: false,
      changed: false,
    });
  });

  it("signale une insertion sans changement à la création, puis un changement quand l'empreinte diffère", async () => {
    expect(await writeProfileSnapshot({ politicianId, document: docA, startedAt: t(1) })).toEqual({
      written: true,
      inserted: true,
      changed: false,
    });
    expect(await writeProfileSnapshot({ politicianId, document: docB, startedAt: t(2) })).toEqual({
      written: true,
      inserted: false,
      changed: true,
    });
    const row = await db.politicianProfileSnapshot.findUnique({ where: { politicianId } });
    expect(row?.contentHash).toBe(hashOf(docB));
    expect(row?.builtAt.toISOString()).toBe(t(2).toISOString());
    expect(row?.version).toBe(1);
  });

  it("compare à l'empreinte validée par un écrivain concurrent, pas à celle d'avant son verrou", async () => {
    const { serializeProfileDocument } = await import("../document");
    // Stored content P (docA). A concurrent writer holds the row while it stores R (docB).
    await writeProfileSnapshot({ politicianId, document: docA, startedAt: t(1) });

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const rowLocked = new Promise<void>((resolve) => (locked = resolve));
    const first = db.$transaction(
      async (tx) => {
        await tx.politicianProfileSnapshot.update({
          where: { politicianId },
          data: {
            data: serializeProfileDocument(docB),
            contentHash: hashOf(docB),
            builtAt: t(10),
          },
        });
        locked();
        await gate;
      },
      { timeout: 15_000 }
    );
    await rowLocked;

    // Writes P again, built later: the row it replaces is R, so the content changed.
    const second = writeProfileSnapshot({ politicianId, document: docA, startedAt: t(20) });
    const deadline = Date.now() + 5_000;
    for (;;) {
      const [row] = await db.$queryRaw<Array<{ waiting: number }>>(Prisma.sql`
        SELECT count(*)::int AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
      `);
      if ((row?.waiting ?? 0) > 0) break;
      if (Date.now() > deadline) throw new Error("le second écrivain n'attend jamais le verrou");
      await new Promise((r) => setTimeout(r, 20));
    }
    release();
    await first;

    expect(await second).toEqual({ written: true, inserted: false, changed: true });
    expect(await storedHash(politicianId)).toBe(hashOf(docA));
  });

  it("construit le document d'un député avec ses votes", async () => {
    const doc = await buildPoliticianProfileDocument({ id: deputeId });
    expect(doc?.mandateType).toBe("DEPUTE");
    expect(doc?.voteStats).not.toBeNull();
  });

  it("ne construit rien pour une fiche non publiée", async () => {
    await db.politician.update({ where: { id: deputeId }, data: { publicationStatus: "DRAFT" } });
    try {
      expect(await buildPoliticianProfileDocument({ id: deputeId })).toBeNull();
    } finally {
      await db.politician.update({
        where: { id: deputeId },
        data: { publicationStatus: "PUBLISHED" },
      });
    }
  });
});
