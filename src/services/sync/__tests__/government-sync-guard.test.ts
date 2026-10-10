import { describe, it, expect, vi, beforeEach } from "vitest";

const { getTextMock, writeMocks, dbMock } = vi.hoisted(() => {
  const w = {
    mandateUpdate: vi.fn(),
    mandateCreate: vi.fn(),
    mandateUpdateMany: vi.fn(),
    politicianCreate: vi.fn(),
    politicianUpdate: vi.fn(),
    externalIdUpsert: vi.fn(),
    mandateGovernmentUpdate: vi.fn(),
  };
  const read = () => vi.fn().mockResolvedValue([]);
  return {
    getTextMock: vi.fn(),
    writeMocks: Object.values(w),
    dbMock: {
      mandate: {
        findMany: read(),
        findFirst: vi.fn().mockResolvedValue(null),
        update: w.mandateUpdate,
        create: w.mandateCreate,
        updateMany: w.mandateUpdateMany,
      },
      politician: {
        findMany: read(),
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
        create: w.politicianCreate,
        update: w.politicianUpdate,
      },
      government: { findMany: read(), findFirst: vi.fn().mockResolvedValue(null) },
      externalId: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: read(),
        upsert: w.externalIdUpsert,
      },
      party: { findFirst: vi.fn().mockResolvedValue(null) },
      mandateGovernment: { update: w.mandateGovernmentUpdate },
    },
  };
});

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/api/http-client", () => ({
  HTTPClient: class {
    getText = getTextMock;
  },
}));

import { syncGouvernement } from "../gouvernement";
import { GOVERNMENT_SYNC_FROZEN } from "../government-sync-guard";

describe("garde du sync gouvernement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTextMock.mockResolvedValue({ data: "" });
  });

  it("est gelé dans ce lot", () => {
    expect(GOVERNMENT_SYNC_FROZEN).toBe(true);
  });

  it("n'écrit rien et ne télécharge rien pendant le gel", async () => {
    const result = await syncGouvernement();
    expect(result.skipped).toBe("government-migration-freeze");
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.membersCreated + result.membersUpdated + result.mandatesCreated).toBe(0);
    for (const fn of writeMocks) expect(fn).not.toHaveBeenCalled();
    expect(getTextMock).not.toHaveBeenCalled();
  });

  it("permet le dry-run pendant le gel, sans aucune écriture", async () => {
    getTextMock.mockResolvedValue({
      data:
        "id;gouvernement;code_fonction;prenom;nom;fonction;date_debut_fonction;date_fin_fonction\n" +
        "600;François Bayrou;M;Anne;Test;Ministre de test;lundi 23 décembre 2024;\n",
    });
    const result = await syncGouvernement({ dryRun: true });
    expect(result.skipped).toBeUndefined();
    expect(result.success).toBe(true);
    expect(getTextMock).toHaveBeenCalledTimes(1);
    expect(result.plan.staleSources.length).toBeGreaterThan(0);
    for (const fn of writeMocks) expect(fn).not.toHaveBeenCalled();
  });

  it("l'option explicite lève la garde", async () => {
    const result = await syncGouvernement({ allowDuringGovernmentMigration: true });
    expect(result.skipped).toBeUndefined();
    expect(getTextMock).toHaveBeenCalledTimes(1);
  });
});
