import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { getTextMock, writeMocks, dbMock, frozen } = vi.hoisted(() => {
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
    frozen: { value: false },
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

vi.mock("../government-sync-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../government-sync-guard")>();
  return {
    ...actual,
    get GOVERNMENT_SYNC_FROZEN() {
      return frozen.value;
    },
  };
});
vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/api/http-client", () => ({
  HTTPClient: class {
    getText = getTextMock;
  },
}));

import { syncGouvernement, loadSyncInput } from "../gouvernement";
import { GOVERNMENT_SYNC_FROZEN } from "../government-sync-guard";

describe("sync gouvernement non gelé", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTextMock.mockResolvedValue({ data: "" });
  });

  it("le gel est levé", () => {
    expect(GOVERNMENT_SYNC_FROZEN).toBe(false);
  });

  it("s'exécute sans l'option de contournement", async () => {
    const result = await syncGouvernement();
    expect(result.skipped).toBeUndefined();
    expect(getTextMock).toHaveBeenCalledTimes(1);
  });

  it("un fichier de corrections absent donne des corrections vides, sans erreur", async () => {
    const input = await loadSyncInput({
      correctionsPath: "/nonexistent/government-corrections.json",
    });
    expect(input).toBeDefined();
  });
});

describe("garde du sync gouvernement (gel simulé)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTextMock.mockResolvedValue({ data: "" });
    frozen.value = true;
  });
  afterEach(() => {
    frozen.value = false;
  });

  it("est gelé quand le drapeau est levé à true", () => {
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
