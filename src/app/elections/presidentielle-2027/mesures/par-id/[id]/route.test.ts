import { beforeEach, describe, expect, it, vi } from "vitest";

const getSlug = vi.fn();
vi.mock("@/lib/data/presidential-measure-detail", () => ({
  getPublicPresidentialMeasureSlugByLegacyId: (...args: unknown[]) => getSlug(...args),
}));

describe("ancienne URL d'une mesure présidentielle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirige définitivement vers le slug public", async () => {
    getSlug.mockResolvedValue("gabriel-attal-creer-des-logements");
    const { GET } = await import("./route");
    const response = await GET(new Request("https://poligraph.fr/ancienne-url"), {
      params: Promise.resolve({ id: "cmsisv2wc000pi3v503tjvmjv" }),
    });

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://poligraph.fr/elections/presidentielle-2027/mesures/gabriel-attal-creer-des-logements"
    );
  });

  it("renvoie 404 si la mesure n'est pas publique", async () => {
    getSlug.mockResolvedValue(null);
    const { GET } = await import("./route");
    const response = await GET(new Request("https://poligraph.fr/ancienne-url"), {
      params: Promise.resolve({ id: "cmsisv2wc000pi3v503tjvmjv" }),
    });
    expect(response.status).toBe(404);
  });
});
