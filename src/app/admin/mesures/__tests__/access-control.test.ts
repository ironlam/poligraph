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
  scanCapped: false,
};

const queryMeasureQueueMock = vi.fn(async () => EMPTY_RESULT);

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

vi.mock("@/lib/auth", () => ({
  isAuthenticated: () => isAuthenticatedMock(),
}));

// Mocked so the pages load without DATABASE_URL, and so a page that queried before checking
// the session would be visible in the call order.
vi.mock("../_data/queue-query", () => ({
  queryMeasureQueue: () => queryMeasureQueueMock(),
}));

vi.mock("../_data/detail-query", () => ({
  getMeasureContext: vi.fn(async () => null),
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
  });

  it("redirige le détail vers la connexion en l'absence de session", async () => {
    isAuthenticatedMock.mockResolvedValue(false);
    const { default: DetailPage } = await import("../[id]/page");

    await expect(DetailPage({ params: Promise.resolve({ id: "mesure-1" }) })).rejects.toThrow(
      "REDIRECT:/admin/login"
    );
    expect(redirectMock).toHaveBeenCalledWith("/admin/login");
  });

  it("laisse passer la file avec une session valide", async () => {
    // Without this case, a guard that redirected unconditionally would pass the two tests
    // above while making the screen unusable.
    isAuthenticatedMock.mockResolvedValue(true);
    const { default: QueuePage } = await import("../page");

    await QueuePage({ searchParams: Promise.resolve({}) });

    expect(redirectMock).not.toHaveBeenCalled();
    expect(queryMeasureQueueMock).toHaveBeenCalledTimes(1);
  });

  it("garde les deux écrans hors des index", async () => {
    // A crawled admin page would publish unreviewed editorial text under our name.
    const queue = await import("../page");
    const detail = await import("../[id]/page");

    expect(queue.metadata.robots).toEqual({ index: false });
    expect(detail.metadata.robots).toEqual({ index: false });
  });
});
