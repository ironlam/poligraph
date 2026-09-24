import { format } from "node:util";
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

/** Ce que la ligne donnerait une fois écrite, quelle que soit la façon dont elle est découpée. */
function rendered(spy: { mock: { calls: unknown[][] } }): string {
  return format(...(spy.mock.calls[0] as [unknown, ...unknown[]]));
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
    // Sur le rendu, pas sur le découpage des arguments : c'est la ligne lue en production.
    expect(rendered(error)).toContain("/api/rss/factchecks.xml");
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
    expect(error.mock.calls[0]).toContain(vraieCause);
    expect(rendered(error)).not.toContain("Dynamic server usage");
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
    expect(rendered(error)).toMatch(/indisponible/i);
  });
});

/**
 * Suite de #911, autre mécanisme, même conséquence : le log perd l'erreur qu'il rapporte.
 *
 * Le premier argument de `console.error` est une chaîne de format. En y interpolant l'URL, un
 * `%s` venu du visiteur y devient un emplacement, que Node remplit avec l'argument suivant,
 * c'est-à-dire l'erreur. Elle est alors recollée dans l'URL au lieu d'être journalisée.
 */
describe("URL portant un spécificateur de format", () => {
  function requestWithFormatSpecifier(): NextRequest {
    return {
      method: "GET",
      url: "https://poligraph.fr/api/politiques/%s",
    } as unknown as NextRequest;
  }

  it("journalise l'erreur et l'URL telles quelles", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new Error("la vraie erreur");
    await withPublicRoute(async () => {
      throw cause;
    })(requestWithFormatSpecifier(), CONTEXT);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(rendered(spy)).toContain("la vraie erreur");
    expect(rendered(spy)).toContain("/api/politiques/%s");
  });
});
