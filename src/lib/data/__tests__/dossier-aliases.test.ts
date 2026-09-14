import { beforeEach, describe, expect, it, vi } from "vitest";
const findMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { legislativeDossier: { findMany } } }));
import { getDossierAliasMatches } from "../dossier-aliases";

describe("getDossierAliasMatches", () => {
  beforeEach(() => findMany.mockReset());
  it("ne cherche pas un nom normalisé vide", async () => {
    expect(await getDossierAliasMatches("loi")).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
  it("renvoie tous les dossiers distincts, uniquement via leurs alias publiés", async () => {
    const matches = [{ id: "a" }, { id: "b" }];
    findMany.mockResolvedValue(matches);
    expect(await getDossierAliasMatches("Loi partagée")).toEqual(matches);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { aliases: { some: { normalizedLabel: "partagee", status: "PUBLISHED" } } },
      })
    );
  });
});
