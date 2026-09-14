import { beforeEach, describe, expect, it, vi } from "vitest";
const matches = vi.hoisted(() => vi.fn());
vi.mock("@/lib/data/dossier-aliases", () => ({ getDossierAliasMatches: matches }));
import { GET } from "../route";
import { SITE_URL } from "@/config/site";

const get = () =>
  GET(new Request("https://untrusted.example/parlement/lois/loi-test"), {
    params: Promise.resolve({ slug: "loi-test" }),
  });
beforeEach(() => matches.mockReset());
describe("résolveur HTTP de nom d’usage", () => {
  it("émet un vrai 308 vers le canonique sur le domaine configuré", async () => {
    matches.mockResolvedValue([{ id: "a", slug: "officiel" }]);
    const response = await get();
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(`${SITE_URL}/parlement/dossiers/officiel`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
  });
  it("ne choisit pas entre plusieurs dossiers", async () => {
    matches.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const response = await get();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${SITE_URL}/parlement/lois/loi-test/dossiers`);
  });
  it("renvoie 404 pour une appellation inconnue ou non publiée", async () => {
    matches.mockResolvedValue([]);
    const response = await get();
    expect(response.status).toBe(404);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, follow");
  });
});
