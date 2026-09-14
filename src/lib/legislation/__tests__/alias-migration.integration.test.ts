// @vitest-environment node
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { beforeAll, afterAll, afterEach, expect, it, vi } from "vitest";
import { assertLocalTestDb, describeIfLocalDb } from "@/test/db-guard";
import { PrismaClient } from "@/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

// This suite replaces ONLY the alias table in a disposable database initialized
// with prisma db push. Never point this opt-in URL at a shared database.
const url = process.env.ALIAS_TEST_DATABASE_URL;
const enabled = Boolean(url);
if (url) {
  const target = new URL(url);
  if (
    target.hostname !== "127.0.0.1" ||
    target.port !== "55485" ||
    target.pathname !== "/alias_test" ||
    target.username !== "alias_test" ||
    url !== process.env.DATABASE_URL
  )
    throw new Error("A dedicated local alias_test database is required");
}
vi.mock("@/lib/auth", () => ({ isAuthenticated: async () => true }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/cache", () => ({ invalidateEntity: vi.fn() }));
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@/generated/prisma");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  return {
    db: new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.ALIAS_TEST_DATABASE_URL }),
    }),
  };
});

describeIfLocalDb.skipIf(!enabled)("alias SQL migration and atomic audit (disposable DB)", () => {
  let pool: Pool;
  let db: PrismaClient;
  let actions: typeof import("@/app/admin/dossiers/[id]/alias-actions");
  const sources = [{ url: "https://www.senat.fr/exemple", label: "Sénat" }];
  const input = { dossierId: "alias-test-dossier", label: "Loi exemple", kind: "COMMON", sources };

  beforeAll(async () => {
    assertLocalTestDb();
    pool = new Pool({ connectionString: url });
    db = new PrismaClient({ adapter: new PrismaPg(pool) });
    await pool.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF; END $$`
    );
    await pool.query(
      'DROP TABLE IF EXISTS "LegislativeDossierAlias"; DROP TYPE IF EXISTS "DossierAliasKind"'
    );
    // Execute the committed SQL, not an equivalent schema push: the partial
    // unique index, RLS and role revocations are absent from the Prisma model.
    const client = await pool.connect();
    try {
      await client.query(
        readFileSync("prisma/migrations/20260914100000_add_dossier_aliases/migration.sql", "utf8")
      );
    } finally {
      client.release();
    }
    await db.legislativeDossier.upsert({
      where: { id: input.dossierId },
      create: {
        id: input.dossierId,
        externalId: "ALIAS_TEST",
        slug: "alias-test-officiel",
        title: "Intitulé officiel de test",
        status: "DEPOSE",
      },
      update: {},
    });
    actions = await import("@/app/admin/dossiers/[id]/alias-actions");
  });
  afterEach(async () => {
    await pool.query('DROP TRIGGER IF EXISTS alias_test_reject_audit ON "AuditLog"');
    await db.legislativeDossierAlias.deleteMany({ where: { dossierId: input.dossierId } });
    await db.auditLog.deleteMany({ where: { entityType: "LegislativeDossierAlias" } });
  });
  afterAll(async () => {
    if (!db) return;
    await db.legislativeDossier.delete({ where: { id: input.dossierId } });
    await pool.query("DROP FUNCTION IF EXISTS alias_test_reject_audit()");
    await db.$disconnect();
    await (await import("@/lib/db")).db.$disconnect();
  });

  async function rejectAudit() {
    await pool.query(`CREATE OR REPLACE FUNCTION alias_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit failure fixture'; END $$;
      CREATE TRIGGER alias_test_reject_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION alias_test_reject_audit()`);
  }
  it("enables RLS, revokes client grants and creates the partial unique index", async () => {
    const { rows } = await pool.query(
      `SELECT relrowsecurity, has_table_privilege('anon', '"LegislativeDossierAlias"', 'SELECT') AS anon_read, has_table_privilege('authenticated', '"LegislativeDossierAlias"', 'INSERT') AS auth_write FROM pg_class WHERE oid = '"LegislativeDossierAlias"'::regclass`
    );
    expect(rows[0]).toEqual({ relrowsecurity: true, anon_read: false, auth_write: false });
    const indexes = await pool.query(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'LegislativeDossierAlias_one_published_preferred_idx'`
    );
    expect(indexes.rows[0].indexdef).toContain("WHERE");
    expect(await actions.createDossierAlias(input)).toEqual({ ok: true });
    const first = await db.legislativeDossierAlias.findFirstOrThrow();
    expect(first.status).toBe("DRAFT");
    expect(first.isPreferred).toBe(false);
    expect(await actions.createDossierAlias(input)).toMatchObject({
      ok: false,
      message: expect.stringContaining("existe déjà"),
    });
    await actions.publishDossierAlias(first.id, true);
    await expect(
      db.legislativeDossierAlias.create({
        data: {
          dossierId: input.dossierId,
          label: "Autre",
          normalizedLabel: "autre",
          kind: "COMMON",
          sources,
          status: "PUBLISHED",
          isPreferred: true,
        },
      })
    ).rejects.toMatchObject({ code: "P2002" });
  });
  it("rolls back alias creation when the audit insert fails", async () => {
    await rejectAudit();
    expect(await actions.createDossierAlias(input)).toMatchObject({ ok: false });
    expect(await db.legislativeDossierAlias.count()).toBe(0);
  });
  it("rolls back deletion when the audit insert fails", async () => {
    await actions.createDossierAlias(input);
    const before = await db.legislativeDossierAlias.findFirstOrThrow();
    await rejectAudit();
    await expect(actions.deleteDossierAlias(before.id)).rejects.toThrow();
    expect(await db.legislativeDossierAlias.findUnique({ where: { id: before.id } })).toEqual(
      before
    );
  });
  it("rolls back publication and evidence edits when the audit insert fails", async () => {
    await actions.createDossierAlias(input);
    const before = await db.legislativeDossierAlias.findFirstOrThrow();
    await rejectAudit();
    await expect(actions.publishDossierAlias(before.id, true)).rejects.toThrow();
    await expect(
      actions.updateDossierAliasSources(before.id, [
        { url: "https://www.senat.fr/autre", label: "Autre source" },
      ])
    ).rejects.toThrow();
    expect(await db.legislativeDossierAlias.findUnique({ where: { id: before.id } })).toEqual(
      before
    );
  });
});
