import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeasureQueueResult } from "../_data/queue-query";

/**
 * The moderation screens show unreviewed editorial text, so they must not be reachable without
 * a session.
 *
 * This is not a formality in this repository: `src/app/admin/layout.tsx` renders its children
 * when the visitor is NOT authenticated, so that the login page can go through. A page that
 * does not check for itself is therefore served to an anonymous request, and there is no
 * `middleware.ts` behind it.
 */

const redirectMock = vi.fn((path: string) => {
  // The real redirect() throws to unwind the render, so the mock does too.
  throw new Error(`REDIRECT:${path}`);
});
const isAuthenticatedMock = vi.fn<() => Promise<boolean>>();

const EMPTY_RESULT: MeasureQueueResult = {
  rows: [],
  total: 0,
  counts: { EMPTY: 0, DRAFT: 0, REVIEWED: 0, PUBLISHED: 0, DEPUBLISHED: 0 },
  anomalyCount: 0,
  withdrawnCount: 0,
  enrichmentCounts: { SUBTOPICS_PENDING: 0, SUBTOPICS_APPROVED: 0, DETAILS_MISSING: 0 },
  scanCapped: false,
};

const queryMeasureQueueMock = vi.fn(async (_filters?: unknown) => EMPTY_RESULT);
const listMeasureQueueCandidatesMock = vi.fn(async () => []);
const queryBatchReviewGroupsMock = vi.fn(async (_filters?: unknown) => []);
const queryBatchPublishGroupsMock = vi.fn(async (_filters?: unknown) => []);
const filterMeasureContextCandidateIdsMock = vi.fn(async (_ids?: string[]) => []);
const queryMeasureEnrichmentCoverageMock = vi.fn(async () => ({
  total: 0,
  withDetails: 0,
  withApprovedSubtopics: 0,
  withQualifications: 0,
  withVoteLinks: 0,
  withSourceLocation: 0,
  withHistory: 0,
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

vi.mock("@/lib/auth", () => ({
  isAuthenticated: () => isAuthenticatedMock(),
}));

vi.mock("@/lib/measures/context-generation", () => ({
  filterMeasureContextCandidateIds: (ids: string[]) => filterMeasureContextCandidateIdsMock(ids),
  hasContextAttemptForRevision: vi.fn(async () => false),
}));

// Mocked so the pages load without DATABASE_URL, and so a page that queried before checking
// the session would be visible in the call order.
vi.mock("../_data/queue-query", () => ({
  queryMeasureQueue: (filters: unknown) => queryMeasureQueueMock(filters),
  listMeasureQueueCandidates: () => listMeasureQueueCandidatesMock(),
}));

vi.mock("../_data/batch-publish-query", () => ({
  queryBatchPublishGroups: (filters: unknown) => queryBatchPublishGroupsMock(filters),
}));

vi.mock("../_data/batch-review-query", () => ({
  queryBatchReviewGroups: (filters: unknown) => queryBatchReviewGroupsMock(filters),
}));

vi.mock("../_data/enrichment-coverage-query", () => ({
  queryMeasureEnrichmentCoverage: () => queryMeasureEnrichmentCoverageMock(),
}));

vi.mock("../_data/detail-query", () => ({
  getMeasureContext: vi.fn(async () => null),
}));

vi.mock("../_data/vote-links-query", () => ({
  getMeasureVoteLinksForModeration: vi.fn(async () => []),
}));

vi.mock("../_data/candidacies-query", () => ({
  listPresidentialCandidacies: vi.fn(async () => []),
}));

// Les écrans importent le panneau d'actions, qui importe les server actions, qui importent les
// transitions, qui chargent le client Prisma en VALEUR. Sans ce mock, les pages ne se chargent pas
// sans DATABASE_URL et le test échoue avant d'avoir vérifié quoi que ce soit.
vi.mock("../actions", () => ({
  createMeasureAction: vi.fn(async () => ({ ok: true })),
  draftRevisionAction: vi.fn(async () => ({ ok: true })),
  reviewRevisionAction: vi.fn(async () => ({ ok: true })),
  reviewDraftBatchAction: vi.fn(async () => ({ ok: true, reviewedCount: 0 })),
  discardRevisionAction: vi.fn(async () => ({ ok: true })),
  publishRevisionAction: vi.fn(async () => ({ ok: true })),
  publishReviewedBatchAction: vi.fn(async () => ({ ok: true, publishedCount: 0 })),
  depublishMeasureAction: vi.fn(async () => ({ ok: true })),
  withdrawMeasureAction: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/data/measures", () => ({
  getMeasureForModeration: vi.fn(async () => null),
  getPublicMeasure: vi.fn(async () => null),
}));

describe("accès aux écrans de modération des mesures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirige la file vers la connexion en l'absence de session", async () => {
    isAuthenticatedMock.mockResolvedValue(false);
    const { default: QueuePage } = await import("../page");

    await expect(QueuePage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "REDIRECT:/admin/login"
    );
    expect(redirectMock).toHaveBeenCalledWith("/admin/login");
    expect(queryMeasureQueueMock).not.toHaveBeenCalled();
    expect(listMeasureQueueCandidatesMock).not.toHaveBeenCalled();
    expect(queryBatchReviewGroupsMock).not.toHaveBeenCalled();
    expect(queryBatchPublishGroupsMock).not.toHaveBeenCalled();
    expect(filterMeasureContextCandidateIdsMock).not.toHaveBeenCalled();
    expect(queryMeasureEnrichmentCoverageMock).not.toHaveBeenCalled();
  });

  it("redirige le détail vers la connexion en l'absence de session", async () => {
    isAuthenticatedMock.mockResolvedValue(false);
    const { default: DetailPage } = await import("../[id]/page");

    await expect(DetailPage({ params: Promise.resolve({ id: "mesure-1" }) })).rejects.toThrow(
      "REDIRECT:/admin/login"
    );
    expect(redirectMock).toHaveBeenCalledWith("/admin/login");
  });

  it("redirige la création vers la connexion en l'absence de session", async () => {
    isAuthenticatedMock.mockResolvedValue(false);
    const { default: NewPage } = await import("../nouvelle/page");

    await expect(NewPage()).rejects.toThrow("REDIRECT:/admin/login");
  });

  it("laisse passer la file avec une session valide", async () => {
    // Without this case, a guard that redirected unconditionally would pass the two tests
    // above while making the screen unusable.
    isAuthenticatedMock.mockResolvedValue(true);
    const { default: QueuePage } = await import("../page");

    await QueuePage({ searchParams: Promise.resolve({}) });

    expect(redirectMock).not.toHaveBeenCalled();
    expect(queryMeasureQueueMock).toHaveBeenCalledTimes(1);
    expect(listMeasureQueueCandidatesMock).toHaveBeenCalledTimes(1);
    expect(queryBatchReviewGroupsMock).toHaveBeenCalledTimes(1);
    expect(queryBatchPublishGroupsMock).toHaveBeenCalledTimes(1);
    expect(queryMeasureEnrichmentCoverageMock).toHaveBeenCalledTimes(1);
  });

  it("transmet le filtre de candidature à toute la file et aux deux actions par lot", async () => {
    isAuthenticatedMock.mockResolvedValue(true);
    const { default: QueuePage } = await import("../page");

    await QueuePage({ searchParams: Promise.resolve({ candidat: "candidature-1" }) });

    expect(queryMeasureQueueMock).toHaveBeenCalledWith(
      expect.objectContaining({ candidacyId: "candidature-1" })
    );
    expect(queryBatchReviewGroupsMock).toHaveBeenCalledWith({
      candidacyId: "candidature-1",
    });
    expect(queryBatchPublishGroupsMock).toHaveBeenCalledWith({
      candidacyId: "candidature-1",
    });
  });

  it("transmet le périmètre public présidentiel à la file", async () => {
    isAuthenticatedMock.mockResolvedValue(true);
    const { default: QueuePage } = await import("../page");

    await QueuePage({
      searchParams: Promise.resolve({
        corpus: "presidentielle-2027",
        enrichissement: "DETAILS_MISSING",
      }),
    });

    expect(queryMeasureQueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enrichment: "DETAILS_MISSING",
        publicCorpus: "PRESIDENTIELLE_2027",
      })
    );
  });

  it("garde les trois écrans hors des index", async () => {
    // A crawled admin page would publish unreviewed editorial text under our name.
    const queue = await import("../page");
    const detail = await import("../[id]/page");
    const create = await import("../nouvelle/page");

    expect(queue.metadata.robots).toEqual({ index: false });
    expect(detail.metadata.robots).toEqual({ index: false });
    expect(create.metadata.robots).toEqual({ index: false });
  });
});
