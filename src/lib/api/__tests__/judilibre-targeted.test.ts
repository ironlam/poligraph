import { describe, it, expect, vi, beforeEach } from "vitest";

// Issue #337 — targeted retrieval by reference. `/search` is full-text, so its hits
// are candidates: these tests pin the exact-match filter that turns them into an
// answer, and the refusal to hand back a near miss.

const h = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("../http-client", () => ({
  HTTPClient: class {
    get = h.get;
  },
  HTTPError: class extends Error {
    constructor(public status: number) {
      super(`HTTP ${status}`);
    }
  },
}));

const ENV = {
  JUDILIBRE_BASE_URL: "https://api.example/judilibre",
  JUDILIBRE_OAUTH_URL: "https://oauth.example/token",
  JUDILIBRE_CLIENT_ID: "id",
  JUDILIBRE_CLIENT_SECRET: "secret",
  JUDILIBRE_API_KEY: "key",
};

let JudilibreClient: typeof import("../judilibre").JudilibreClient;
let buildJudilibreDecisionUrl: typeof import("../judilibre").buildJudilibreDecisionUrl;

beforeEach(async () => {
  vi.clearAllMocks();
  Object.assign(process.env, ENV);
  ({ JudilibreClient, buildJudilibreDecisionUrl } = await import("../judilibre"));

  // OAuth is a bare fetch, not the mocked HTTP client.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "t", token_type: "Bearer", expires_in: 3600 }),
    })
  );
});

function summary(overrides: Record<string, unknown> = {}) {
  return {
    id: "dec_1",
    number: "96-83.698",
    numbers: ["96-83.698"],
    decision_date: "1997-10-27",
    jurisdiction: "cc",
    chamber: "cr",
    solution: "rejet",
    type: "arret",
    themes: [],
    summary: "",
    ...overrides,
  };
}

describe("findDecisionsByPourvoiNumber (#337)", () => {
  it("rend la décision dont le pourvoi correspond exactement", async () => {
    h.get.mockResolvedValue({ data: { results: [summary()], total: 1, page: 0, page_size: 10 } });

    const found = await new JudilibreClient().findDecisionsByPourvoiNumber("96-83.698");

    expect(found).toHaveLength(1);
    expect(found[0]!.id).toBe("dec_1");
  });

  it("tolère les variantes d'écriture du pourvoi demandé", async () => {
    h.get.mockResolvedValue({ data: { results: [summary()], total: 1, page: 0, page_size: 10 } });
    const client = new JudilibreClient();

    for (const variant of ["96-83.698", "96-83698", "9683698", " 96 83 698 "]) {
      expect(await client.findDecisionsByPourvoiNumber(variant)).toHaveLength(1);
    }
  });

  it("écarte un résultat plein texte dont le pourvoi diffère", async () => {
    // Le piège : /search répond sur le texte, pas sur la référence.
    h.get.mockResolvedValue({
      data: {
        results: [summary({ id: "bruit", number: "12-34.567", numbers: ["12-34.567"] }), summary()],
        total: 2,
        page: 0,
        page_size: 10,
      },
    });

    const found = await new JudilibreClient().findDecisionsByPourvoiNumber("96-83.698");

    expect(found.map((d) => d.id)).toEqual(["dec_1"]);
  });

  it("reconnaît un pourvoi porté par la liste secondaire", async () => {
    h.get.mockResolvedValue({
      data: {
        results: [summary({ number: "97-81.102", numbers: ["97-81.102", "96-83.698"] })],
        total: 1,
        page: 0,
        page_size: 10,
      },
    });

    expect(await new JudilibreClient().findDecisionsByPourvoiNumber("96-83.698")).toHaveLength(1);
  });

  it("rend une LISTE : un pourvoi peut produire plusieurs décisions", async () => {
    h.get.mockResolvedValue({
      data: {
        results: [summary(), summary({ id: "dec_2", solution: "cassation" })],
        total: 2,
        page: 0,
        page_size: 10,
      },
    });

    const found = await new JudilibreClient().findDecisionsByPourvoiNumber("96-83.698");

    expect(found.map((d) => d.id)).toEqual(["dec_1", "dec_2"]);
  });

  it("rend une liste vide sans appeler l'API sur une référence vide", async () => {
    expect(await new JudilibreClient().findDecisionsByPourvoiNumber("   ")).toEqual([]);
    expect(h.get).not.toHaveBeenCalled();
  });
});

describe("findDecisionByEcli (#337)", () => {
  it("rend la décision dont l'ECLI correspond exactement", async () => {
    h.get.mockResolvedValue({
      data: {
        results: [summary({ ecli: "ECLI:FR:CCASS:2026:CR00556" })],
        total: 1,
        page: 0,
        page_size: 10,
      },
    });

    const found = await new JudilibreClient().findDecisionByEcli("ECLI:FR:CCASS:2026:CR00556");

    expect(found?.id).toBe("dec_1");
  });

  it("rend null plutôt qu'un résultat approchant", async () => {
    h.get.mockResolvedValue({
      data: {
        results: [summary({ ecli: "ECLI:FR:CCASS:2026:CR00999" })],
        total: 1,
        page: 0,
        page_size: 10,
      },
    });

    expect(await new JudilibreClient().findDecisionByEcli("ECLI:FR:CCASS:2026:CR00556")).toBeNull();
  });

  it("rend null quand la décision trouvée n'a pas d'ECLI", async () => {
    h.get.mockResolvedValue({ data: { results: [summary()], total: 1, page: 0, page_size: 10 } });

    expect(await new JudilibreClient().findDecisionByEcli("ECLI:FR:CCASS:1997:CR00001")).toBeNull();
  });
});

describe("getTaxonomy (#337)", () => {
  it("rend la table de libellés officielle", async () => {
    h.get.mockResolvedValue({ data: { result: { cr: "Chambre criminelle" } } });

    const taxonomy = await new JudilibreClient().getTaxonomy("chamber");

    expect(taxonomy).toEqual({ cr: "Chambre criminelle" });
    expect(h.get.mock.calls[0]![0]).toContain("/taxonomy?id=chamber");
  });

  it("ne rappelle pas l'API pour la même taxonomie", async () => {
    h.get.mockResolvedValue({ data: { result: { cc: "Cour de cassation" } } });
    const client = new JudilibreClient();

    await client.getTaxonomy("jurisdiction");
    await client.getTaxonomy("jurisdiction");

    expect(h.get).toHaveBeenCalledTimes(1);
  });
});

describe("buildJudilibreDecisionUrl (#337)", () => {
  it("construit l'URL publique de la Cour de cassation", () => {
    expect(buildJudilibreDecisionUrl("6079a87a9ba5988459c4d674")).toBe(
      "https://www.courdecassation.fr/decision/6079a87a9ba5988459c4d674"
    );
  });
});
