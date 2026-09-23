import { describe, it, expect, vi, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import { withPublicRoute } from "../with-public-route";

const CONTEXT = { params: Promise.resolve({}) };

/** A request whose `url` throws, which is what Next does while a route is being prerendered. */
function prerenderingRequest(): NextRequest {
  return {
    method: "GET",
    get url(): string {
      throw new Error(
        "Dynamic server usage: Route /api/rss/factchecks.xml couldn't be rendered statically because it used `request.url`."
      );
    },
  } as unknown as NextRequest;
}

function ordinaryRequest(): NextRequest {
  return {
    method: "GET",
    url: "https://poligraph.fr/api/rss/factchecks.xml",
  } as unknown as NextRequest;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("withPublicRoute", () => {
  it("laisse passer une réponse normale sans y toucher", async () => {
    const response = new Response("ok", { status: 200 });
    const handler = withPublicRoute(async () => response);
    expect(await handler(ordinaryRequest(), CONTEXT)).toBe(response);
  });

  it("transforme une erreur du handler en 500 sans détail interne", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withPublicRoute(async () => {
      throw new Error("la base a refusé la requête");
    });
    const res = await handler(ordinaryRequest(), CONTEXT);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Erreur serveur" });
  });

  it("journalise l'URL quand elle est lisible", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withPublicRoute(async () => {
      throw new Error("échec");
    });
    await handler(ordinaryRequest(), CONTEXT);
    expect(String(error.mock.calls[0]?.[0])).toContain("/api/rss/factchecks.xml");
  });

  /**
   * POLIGRAPH-2T : pendant un prérendu, lire `request.url` lève une DynamicServerError. Quand cette
   * lecture avait lieu dans le catch, elle remplaçait l'erreur qu'on était en train de rapporter,
   * et on ne voyait plus jamais ce qui avait réellement échoué.
   */
  it("ne laisse pas la journalisation masquer l'erreur qu'elle rapporte", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const vraieCause = new Error("la vraie cause, celle qui nous intéresse");
    const handler = withPublicRoute(async () => {
      throw vraieCause;
    });

    const res = await handler(prerenderingRequest(), CONTEXT);

    expect(res.status).toBe(500);
    // L'erreur d'origine doit avoir été journalisée, pas celle de la lecture d'URL.
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[1]).toBe(vraieCause);
    expect(String(error.mock.calls[0]?.[0])).not.toContain("Dynamic server usage");
  });

  it("ne propage pas l'échec de lecture de l'URL à l'appelant", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withPublicRoute(async () => {
      throw new Error("échec");
    });
    await expect(handler(prerenderingRequest(), CONTEXT)).resolves.toBeInstanceOf(Response);
  });

  it("dit que l'URL manque plutôt que de faire croire à une URL vide", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withPublicRoute(async () => {
      throw new Error("échec");
    });
    await handler(prerenderingRequest(), CONTEXT);
    expect(String(error.mock.calls[0]?.[0])).toMatch(/indisponible/i);
  });
});
