import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCLI: vi.fn(),
  syncLegislation: vi.fn(),
}));

vi.mock("@/lib/sync", () => ({ createCLI: mocks.createCLI }));
vi.mock("@/lib/db", () => ({ db: { legislativeDossier: {} } }));
vi.mock("@/services/sync/legislation", () => ({
  syncLegislation: mocks.syncLegislation,
}));

import { legislationSyncHandler } from "../sync-legislation";

describe("sync-legislation CLI routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.syncLegislation.mockResolvedValue({
      dossiersProcessed: 2,
      dossiersCreated: 0,
      dossiersUpdated: 2,
      dossiersSkipped: 1,
      errors: [],
    });
  });

  it("routes --origin-only through the tested service implementation", async () => {
    const result = await legislationSyncHandler.sync({
      leg: "17",
      originOnly: true,
      dryRun: true,
      limit: 5,
    });

    expect(mocks.syncLegislation).toHaveBeenCalledWith({
      legislature: 17,
      originOnly: true,
      dryRun: true,
      limit: 5,
      activeOnly: false,
      todayOnly: false,
      sinceDays: undefined,
    });
    expect(result).toMatchObject({
      success: true,
      stats: { processed: 2, updated: 2, skipped: 1 },
    });
  });
});
