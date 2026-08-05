import { afterEach, describe, expect, it } from "vitest";
import { seedMeasuresDemoCorpus } from "../measures-demo";

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

function restoreDatabaseUrl(): void {
  if (ORIGINAL_DATABASE_URL === undefined) {
    delete process.env.DATABASE_URL;
    return;
  }
  process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
}

describe("seedMeasuresDemoCorpus : la garde avant toute écriture", () => {
  afterEach(restoreDatabaseUrl);

  it("refuse une base de production", async () => {
    // The corpus attributes invented positions to fictional candidates. Writing it into the
    // production database would put fabricated political claims in front of the public, and
    // `.env` points at production, so this refusal is the only thing standing between the two.
    process.env.DATABASE_URL = "postgresql://postgres:secret@db.example.supabase.co:5432/postgres";

    await expect(seedMeasuresDemoCorpus()).rejects.toThrow(/conteneur jetable/);
  });

  it("refuse une base locale qui n'est pas le conteneur jetable", async () => {
    // A local database is not enough: the harness container is destroyed on exit, a local
    // development database is not.
    process.env.DATABASE_URL = "postgresql://poligraph:poligraph@localhost:5432/poligraph";

    await expect(seedMeasuresDemoCorpus()).rejects.toThrow(/conteneur jetable/);
  });

  it("refuse une DATABASE_URL absente", async () => {
    delete process.env.DATABASE_URL;

    await expect(seedMeasuresDemoCorpus()).rejects.toThrow(/conteneur jetable/);
  });
});
