import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CANDIDATURES_RESOURCE_ID,
  fetchResolvedCandidaturesCSV,
  resolveCandidaturesCsvUrl,
} from "../candidatures-source";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveCandidaturesCsvUrl", () => {
  it("sélectionne la ressource stable dans la réponse du dataset", async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        resources: [
          { id: "autre-ressource", url: "https://example.test/autre.csv" },
          { id: CANDIDATURES_RESOURCE_ID, url: "https://static.data.gouv.fr/current.csv" },
        ],
      },
    });

    await expect(resolveCandidaturesCsvUrl({ get })).resolves.toBe(
      "https://static.data.gouv.fr/current.csv"
    );
  });

  it("retombe sur l'endpoint stable de la ressource si l'API échoue", async () => {
    const get = vi.fn().mockRejectedValue(new Error("API indisponible"));

    await expect(resolveCandidaturesCsvUrl({ get })).resolves.toBe(
      `https://www.data.gouv.fr/api/1/datasets/r/${CANDIDATURES_RESOURCE_ID}`
    );
  });
});

describe("fetchResolvedCandidaturesCSV", () => {
  it("échoue si l'URL résolue renvoie un statut non-2xx", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          resources: [
            { id: CANDIDATURES_RESOURCE_ID, url: "https://static.data.gouv.fr/current.csv" },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: false, status: 404, statusText: "Not Found" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchResolvedCandidaturesCSV()).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://static.data.gouv.fr/current.csv");
  });
});
