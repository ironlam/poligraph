import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  db: { affair: { findUnique: vi.fn() } },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/api/with-admin-auth", () => ({ withAdminAuth: (handler: unknown) => handler }));
vi.mock("@/lib/cache", () => ({ invalidateEntity: vi.fn() }));
vi.mock("@/lib/utils", () => ({ generateAffairSlug: vi.fn() }));
vi.mock("@/services/affairs/status-tracking", () => ({ trackStatusChange: vi.fn() }));
vi.mock("@/lib/affairs/publish-guard", () => ({
  assertPublishable: vi.fn(),
  PublishGuardError: class PublishGuardError extends Error {},
  VERIFIED_BY_MODERATION: "Poligraph Moderation",
  PUBLISHED_STATUS: "PUBLISHED",
}));

import { PUT } from "./route";

describe("PUT admin affair politician guard", () => {
  it("rejects changing the politician of a published affair before writes", async () => {
    h.db.affair.findUnique.mockResolvedValue({
      id: "affair-1",
      politicianId: "politician-1",
      publicationStatus: "PUBLISHED",
      title: "Affaire test",
      slug: "affaire-test",
      politician: { slug: "jean-test" },
    });
    const body = {
      politicianId: "politician-2",
      title: "Affaire test",
      description: "Description",
      status: "ENQUETE_PRELIMINAIRE",
      category: "AUTRE",
      appeal: false,
      sources: [
        {
          url: "https://example.test/source",
          title: "Source",
          publisher: "Example",
          publishedAt: "2026-01-01",
        },
      ],
    };
    const response = await PUT(
      new NextRequest("https://poligraph.fr/api/admin/affaires/affair-1", {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "affair-1" }) }
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "PUBLISHED_AFFAIR_POLITICIAN_CHANGE_REQUIRES_DEDICATED_WORKFLOW",
    });
  });
});
