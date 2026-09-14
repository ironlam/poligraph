import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  raw: vi.fn(),
  count: vi.fn(),
  articles: vi.fn(),
  rejections: vi.fn(),
  failedSyncs: vi.fn(),
  duplicates: vi.fn(),
  pipelines: vi.fn(),
  activity: vi.fn(),
  history: vi.fn(),
}));

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: h.raw,
    affairUpdateProposal: { count: h.count },
    moderationReview: { count: h.count },
    affairPoliticianDecision: { count: h.count },
    auditLog: { findMany: h.activity },
    syncJob: { findMany: h.history },
  },
}));
vi.mock("@/lib/admin/queue-counts", () => ({
  countArticlesToLink: h.articles,
  countRecentPressRejections: h.rejections,
  countRecentFailedSyncs: h.failedSyncs,
}));
vi.mock("@/lib/data/pipelines", () => ({ getPipelineHealthAll: h.pipelines }));
vi.mock("@/services/affairs/reconciliation", () => ({ findPotentialDuplicates: h.duplicates }));

import { getDashboardCounts, getDashboardSecondaryData } from "./dashboard";

beforeEach(() => {
  vi.clearAllMocks();
  h.raw.mockResolvedValue([
    {
      total_politicians: BigInt(1),
      published_politicians: BigInt(1),
      without_photo: BigInt(0),
      draft_politicians: BigInt(0),
      without_bio: BigInt(0),
      total_affairs: BigInt(2),
      draft_affairs: BigInt(1),
      without_ecli: BigInt(0),
    },
  ]);
  h.count.mockResolvedValue(0);
  h.articles.mockResolvedValue(0);
  h.rejections.mockResolvedValue(0);
  h.failedSyncs.mockResolvedValue(0);
  h.duplicates.mockResolvedValue([{ id: "a" }, { id: "b" }]);
  h.pipelines.mockResolvedValue([]);
  h.activity.mockResolvedValue([]);
  h.history.mockResolvedValue([]);
});

describe("dashboard data boundaries", () => {
  it("does not run duplicate detection on the critical dashboard path", async () => {
    await getDashboardCounts();
    expect(h.duplicates).not.toHaveBeenCalled();
  });

  it("keeps the exact duplicate count in the deferred path", async () => {
    await expect(getDashboardSecondaryData()).resolves.toMatchObject({ duplicates: 2 });
    expect(h.duplicates).toHaveBeenCalledOnce();
  });
});
