import { describe, it, expect, vi } from "vitest";
import { VOTES_LISTING_FILTER_KEYS } from "@/lib/seo/listing-filters";

vi.mock("@/lib/db", () => ({ db: {} }));

import { generateMetadata } from "@/app/parlement/votes/page";

const metadata = (params: Record<string, string | undefined> = {}) =>
  generateMetadata({ searchParams: Promise.resolve(params) });
const oldDescription =
  "Suivez les votes de l'Assemblée nationale et du Sénat. Consultez les scrutins et découvrez comment votent vos représentants.";

describe("métadonnées de la liste des votes", () => {
  it("présente qui vote quoi sur la vue nue, indexable avec son canonical actuel", async () => {
    const m = await metadata();
    expect(m.title).toBe("Qui vote quoi ? Votes de l'Assemblée et du Sénat");
    expect(m.description).toBe(
      "Qui vote quoi au Parlement ? Suivez les votes des députés et sénateurs, consultez les scrutins et découvrez comment votent vos représentants."
    );
    expect(m.description!.length).toBeLessThanOrEqual(155);
    expect(m.title).not.toMatch(/[\u2013\u2014]/);
    expect(m.description).not.toMatch(/[\u2013\u2014]/);
    expect(m.robots).toBeUndefined();
    expect(m.alternates?.canonical).toBe("/parlement/votes");
  });

  it.each(VOTES_LISTING_FILTER_KEYS)(
    "conserve le titre et le noindex du filtre %s",
    async (key) => {
      const m = await metadata({ [key]: "x" });
      expect(m.title).toBe("Votes parlementaires");
      expect(m.description).toBe(oldDescription);
      expect(m.robots).toEqual({ index: false, follow: true });
      const qs = ["type", "theme", "legislature", "chamber", "result"].includes(key)
        ? `?${key}=x`
        : "";
      expect(m.alternates?.canonical).toBe(`/parlement/votes${qs}`);
    }
  );

  it.each([
    ["AN", "Votes de l'Assemblée nationale"],
    ["SENAT", "Votes du Sénat"],
  ])("conserve le titre de la chambre %s", async (chamber, title) => {
    expect((await metadata({ chamber })).title).toBe(title);
  });

  it("préserve les exceptions robots de sort=recent et des filtres vides", async () => {
    for (const params of [{ sort: "recent" }, { chamber: "" }]) {
      const m = await metadata(params);
      expect(m.title).toBe("Votes parlementaires");
      expect(m.description).toBe(oldDescription);
      expect(m.robots).toBeUndefined();
      expect(m.alternates?.canonical).toBe("/parlement/votes");
    }
  });

  it("conserve le noindex de la pagination", async () => {
    const m = await metadata({ page: "2" });
    expect(m.title).toBe("Votes parlementaires");
    expect(m.description).toBe(oldDescription);
    expect(m.robots).toEqual({ index: false, follow: true });
    expect(m.alternates?.canonical).toBe("/parlement/votes");
  });

  it.each([{}, { sort: "recent" }])("préserve la vue expliquée %j", async (params) => {
    const m = await metadata({ ...params, filter: "expliques" });
    expect(m.title).toBe("Votes expliqués");
    expect(m.description).toBe(
      "Les votes de l'Assemblée nationale et du Sénat traduits en titres clairs et vérifiés."
    );
    expect(m.robots).toBeUndefined();
    expect(m.alternates?.canonical).toBe("/parlement/votes?filter=expliques");
  });

  it.each([...VOTES_LISTING_FILTER_KEYS, "page"])(
    "préserve la vue expliquée avec la facette %s",
    async (key) => {
      const m = await metadata({ filter: "expliques", [key]: key === "page" ? "2" : "x" });
      expect(m.title).toBe("Votes parlementaires");
      expect(m.description).toBe(oldDescription);
      expect(m.robots).toEqual({ index: false, follow: true });
      expect(m.alternates?.canonical).not.toContain("filter=expliques");
    }
  );
});
