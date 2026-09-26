import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@/lib/api/with-public-route", () => ({
  withPublicRoute: <T extends (...args: never[]) => unknown>(handler: T) => handler,
}));
vi.mock("@/lib/db", () => ({
  db: { politician: { findUnique: mocks.findUnique, update: mocks.update } },
}));
vi.mock("@vercel/blob", () => ({ put: mocks.put }));

import { GET } from "./route";

const context = { params: Promise.resolve({ id: "politician-1" }) };
const request = new NextRequest("https://poligraph.fr/api/images/politician-1");

function sourceRepond(contentType: string | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response("corps", {
        status: 200,
        headers: contentType === null ? {} : { "content-type": contentType },
      })
    )
  );
}

/**
 * Le défaut mesuré en production : 136 photos sur 1428 étaient des pages HTML. Les sites publics
 * français répondent 200 avec un interstitiel, la route stockait ce corps tel quel, et la branche
 * de cache y redirigeait ensuite sans jamais revérifier.
 */
describe("GET /api/images/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue({
      photoUrl: "https://www.assemblee-nationale.fr/photo.jpg",
      blobPhotoUrl: null,
    });
    mocks.put.mockResolvedValue({ url: "https://blob.example/politicians/politician-1" });
  });

  it("met en cache une vraie image", async () => {
    sourceRepond("image/jpeg");

    const response = await GET(request, context);

    expect(mocks.put).toHaveBeenCalledOnce();
    expect(mocks.put.mock.calls[0]![2]).toMatchObject({ contentType: "image/jpeg" });
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(response.status).toBe(302);
  });

  it.each([
    { contentType: "text/html; charset=utf-8", cas: "une page d'interstitiel renvoyée en 200" },
    { contentType: "application/json", cas: "une erreur structurée renvoyée en 200" },
    { contentType: null, cas: "aucun en-tête, que l'ancien code étiquetait image/jpeg" },
  ])("ne met rien en cache quand la source répond $contentType ($cas)", async ({ contentType }) => {
    sourceRepond(contentType);

    const response = await GET(request, context);

    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
  });
});
