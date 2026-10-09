import { describe, it, expect, vi, beforeEach } from "vitest";

const { getTextMock, writeMocks, dbMock } = vi.hoisted(() => {
  const w = {
    mandateUpdate: vi.fn(),
    mandateCreate: vi.fn(),
    mandateUpdateMany: vi.fn(),
    politicianCreate: vi.fn(),
    politicianUpdate: vi.fn(),
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

  it("l'option explicite lève la garde", async () => {
    const result = await syncGouvernement({ allowDuringGovernmentMigration: true });
    expect(result.skipped).toBeUndefined();
    expect(getTextMock).toHaveBeenCalledTimes(1);
  });
});
