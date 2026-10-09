import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  put: vi.fn(),
  lookup: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup, default: { lookup: mocks.lookup } }));

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

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(5000)]);
const HTML = Buffer.from("<!DOCTYPE html><html><body>Accès refusé</body></html>".padEnd(5000, " "));
/** Réponse de NosSénateurs quand le portrait manque : un PNG noir de 129 octets, en 200. */
const PLACEHOLDER = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(121),
]);

function sourceRepond(body: Buffer, contentType: string | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(new Uint8Array(body), {
        status: 200,
        headers: contentType === null ? {} : { "content-type": contentType },
      })
    )
  );
}

/**
 * Le défaut mesuré en production : 136 photos sur 1428 étaient des pages HTML. Les sites publics
 * français répondent 200 avec un interstitiel, la route stockait ce corps tel quel, et la branche
 * de cache y redirigeait ensuite sans jamais revérifier. Les octets décident désormais, pas
 * l'en-tête.
 */
describe("GET /api/images/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue({
      photoUrl: "https://www.assemblee-nationale.fr/photo.jpg",
      blobPhotoUrl: null,
    });
    mocks.put.mockResolvedValue({ url: "https://blob.example/politicians/politician-1-Xy7" });
    mocks.lookup.mockResolvedValue([{ address: "185.15.58.224" }]);
  });

  it.each([
    { contentType: "image/jpeg", cas: "le cas nominal" },
    { contentType: "text/plain", cas: "un en-tête faux" },
    { contentType: null, cas: "aucun en-tête" },
  ])("met en cache une vraie image JPEG ($cas)", async ({ contentType }) => {
    sourceRepond(JPEG, contentType);

    const response = await GET(request, context);

    expect(mocks.put).toHaveBeenCalledOnce();
    // Le type stocké vient des octets, à une adresse neuve.
    expect(mocks.put.mock.calls[0]![2]).toMatchObject({
      contentType: "image/jpeg",
      addRandomSuffix: true,
    });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "politician-1" },
      data: { blobPhotoUrl: "https://blob.example/politicians/politician-1-Xy7" },
    });
    expect(response.status).toBe(302);
  });

  it.each([
    { body: HTML, contentType: "text/html; charset=utf-8", cas: "une page d'interstitiel en 200" },
    { body: HTML, contentType: "image/jpeg", cas: "une page HTML annoncée comme image" },
    { body: PLACEHOLDER, contentType: "image/png", cas: "le PNG noir de NosSénateurs" },
  ])("ne met rien en cache pour $cas", async ({ body, contentType }) => {
    sourceRepond(body, contentType);

    const response = await GET(request, context);

    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
  });

  /**
   * La route est publique : sans garde, une `photoUrl` saisie dans l'admin ou une redirection de la
   * source menait le serveur vers une adresse interne (#1008).
   */
  describe("protection SSRF", () => {
    /** Imite `fetch` : sans `redirect: "manual"`, la redirection est suivie sans contrôle. */
    function sourceRedirige(location: string) {
      let redirected = false;
      const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
        if (redirected || init?.redirect !== "manual") {
          return new Response(new Uint8Array(JPEG), { status: 200 });
        }
        redirected = true;
        return new Response(null, { status: 302, headers: { location } });
      });
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    it("refuse un hôte qui pointe vers une adresse interne, sans le contacter", async () => {
      mocks.lookup.mockResolvedValue([{ address: "169.254.169.254" }]);
      sourceRepond(JPEG, "image/jpeg");

      const response = await GET(request, context);

      expect(fetch).not.toHaveBeenCalled();
      expect(mocks.put).not.toHaveBeenCalled();
      expect(response.status).toBe(404);
    });

    it("refuse une redirection vers une adresse interne", async () => {
      const fetchMock = sourceRedirige("https://127.0.0.1/latest/meta-data/");

      const response = await GET(request, context);

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(mocks.put).not.toHaveBeenCalled();
      expect(response.status).toBe(404);
    });

    it("refuse une adresse en http", async () => {
      mocks.findUnique.mockResolvedValue({
        photoUrl: "http://www.assemblee-nationale.fr/photo.jpg",
        blobPhotoUrl: null,
      });
      sourceRepond(JPEG, "image/jpeg");

      const response = await GET(request, context);

      expect(fetch).not.toHaveBeenCalled();
      expect(response.status).toBe(404);
    });

    it("suit une redirection vers un hôte public", async () => {
      const fetchMock = sourceRedirige("https://upload.wikimedia.org/photo.jpg");

      const response = await GET(request, context);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(mocks.put).toHaveBeenCalledOnce();
      expect(response.status).toBe(302);
    });

    it("renvoie vers la source quand elle est injoignable", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

      const response = await GET(request, context);

      expect(mocks.put).not.toHaveBeenCalled();
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("https://www.assemblee-nationale.fr/photo.jpg");
    });
  });
});
