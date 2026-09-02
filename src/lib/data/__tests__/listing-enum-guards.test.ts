import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    scrutin: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
    affair: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
    factCheck: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
  },
}));
vi.mock("@/services/factcheckStats", () => ({ factcheckStatsService: {} }));

import { db } from "@/lib/db";
import { Chamber, VotingResult, ThemeCategory } from "@/generated/prisma";
import { pickEnumValue } from "@/lib/data/enum-guards";
import { getScrutins } from "@/lib/data/scrutins";
import { getAffairs } from "@/lib/data/affairs";
import { getFactchecks } from "@/lib/data/factchecks";

// Real payload lifted from the production log of 2026-09-01 17:07 UTC.
const SQLMAP_PAYLOAD = "AN UNION ALL SELECT 'oxopqmolteriiecourwsnucsmjrmbryy',NULL,NULL-- vwzg0a";

describe("pickEnumValue", () => {
  it("laisse passer une valeur de l'enum", () => {
    expect(pickEnumValue("AN", Chamber)).toBe("AN");
    expect(pickEnumValue("SENAT", Chamber)).toBe("SENAT");
    expect(pickEnumValue("ADOPTED", VotingResult)).toBe("ADOPTED");
  });

  it("écarte toute valeur hors enum", () => {
    expect(pickEnumValue("GARBAGE", Chamber)).toBeUndefined();
    expect(pickEnumValue(SQLMAP_PAYLOAD, Chamber)).toBeUndefined();
    expect(pickEnumValue("an", Chamber)).toBeUndefined();
    expect(pickEnumValue("AN ", Chamber)).toBeUndefined();
  });

  it("traite vide, undefined et null comme absence de filtre", () => {
    expect(pickEnumValue("", Chamber)).toBeUndefined();
    expect(pickEnumValue(undefined, Chamber)).toBeUndefined();
    expect(pickEnumValue(null, Chamber)).toBeUndefined();
  });
});

describe("getScrutins : les paramètres d'enum invalides n'atteignent pas Prisma", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db.scrutin.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.scrutin.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (db.scrutin.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  const whereOf = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls[0]?.[0]?.where ?? {};

  it("un chamber invalide est retiré du where (les 3 requêtes)", async () => {
    await getScrutins({ page: 1, limit: 20, chamber: SQLMAP_PAYLOAD as never });

    // Les trois requêtes du log de prod : findMany, count, groupBy.
    expect(whereOf(db.scrutin.findMany as ReturnType<typeof vi.fn>)).not.toHaveProperty("chamber");
    expect(whereOf(db.scrutin.count as ReturnType<typeof vi.fn>)).not.toHaveProperty("chamber");
    expect(whereOf(db.scrutin.groupBy as ReturnType<typeof vi.fn>)).not.toHaveProperty("chamber");
  });

  it("un chamber valide est conservé", async () => {
    await getScrutins({ page: 1, limit: 20, chamber: "AN" });
    expect(whereOf(db.scrutin.findMany as ReturnType<typeof vi.fn>)).toMatchObject({
      chamber: "AN",
    });
  });

  it("un result invalide est retiré du where", async () => {
    await getScrutins({ page: 1, limit: 20, result: "XX" as never });
    expect(whereOf(db.scrutin.findMany as ReturnType<typeof vi.fn>)).not.toHaveProperty("result");
  });

  it("un result valide est conservé", async () => {
    await getScrutins({ page: 1, limit: 20, result: "ADOPTED" });
    expect(whereOf(db.scrutin.findMany as ReturnType<typeof vi.fn>)).toMatchObject({
      result: "ADOPTED",
    });
  });

  it("un theme invalide est retiré du where", async () => {
    await getScrutins({ page: 1, limit: 20, theme: "Nimportequoi" as never });
    expect(whereOf(db.scrutin.findMany as ReturnType<typeof vi.fn>)).not.toHaveProperty("theme");
  });

  it("un theme valide est conservé", async () => {
    const theme = Object.values(ThemeCategory)[0]!;
    await getScrutins({ page: 1, limit: 20, theme });
    expect(whereOf(db.scrutin.findMany as ReturnType<typeof vi.fn>)).toMatchObject({ theme });
  });
});

describe("getAffairs : status et category invalides n'atteignent pas Prisma", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db.affair.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.affair.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
  });

  const affairWhere = () =>
    (db.affair.findMany as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.where ?? {};

  it("un status invalide est retiré du where", async () => {
    await getAffairs(undefined, "GARBAGE");
    expect(affairWhere()).not.toHaveProperty("status");
  });

  it("un status valide est conservé", async () => {
    await getAffairs(undefined, "MISE_EN_EXAMEN");
    expect(affairWhere()).toMatchObject({ status: "MISE_EN_EXAMEN" });
  });

  it("une category invalide est retirée du where", async () => {
    await getAffairs(undefined, undefined, undefined, "GARBAGE");
    expect(affairWhere()).not.toHaveProperty("category");
  });

  it("une category valide est conservée", async () => {
    await getAffairs(undefined, undefined, undefined, "CORRUPTION");
    expect(affairWhere()).toMatchObject({ category: { in: ["CORRUPTION"] } });
  });
});

describe("getFactchecks : verdict invalide n'atteint pas Prisma", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db.factCheck.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.factCheck.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
  });

  const fcWhere = () =>
    (db.factCheck.findMany as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.where ?? {};

  it("un verdict invalide est retiré du where", async () => {
    await getFactchecks({ page: 1, limit: 20, verdict: "GARBAGE" });
    expect(fcWhere()).not.toHaveProperty("verdictRating");
  });

  it("un verdict valide est conservé", async () => {
    await getFactchecks({ page: 1, limit: 20, verdict: "FALSE" });
    expect(fcWhere()).toMatchObject({ verdictRating: "FALSE" });
  });
});
