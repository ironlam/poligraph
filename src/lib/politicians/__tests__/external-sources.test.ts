import { describe, it, expect } from "vitest";
import { buildSourceLinks } from "@/lib/politicians/external-sources";

describe("buildSourceLinks", () => {
  it("drops entries without url and orders by source priority", () => {
    const links = buildSourceLinks([
      { source: "WIKIDATA", url: "https://www.wikidata.org/wiki/Q1" },
      { source: "HATVP", url: "https://www.hatvp.fr/fiche/x" },
      { source: "MANUAL", url: null },
    ]);
    expect(links.map((l) => l.source)).toEqual(["HATVP", "WIKIDATA"]);
    expect(links[0].label).toBe("HATVP");
  });

  it("dedupes only strictly identical (source, normalized url)", () => {
    const links = buildSourceLinks([
      { source: "HATVP", url: "https://www.hatvp.fr/fiche/x/" },
      { source: "HATVP", url: "https://www.hatvp.fr/fiche/x?utm_source=a" },
    ]);
    expect(links).toHaveLength(1);
  });

  it("keeps multiple distinct urls for the same source", () => {
    const links = buildSourceLinks([
      { source: "ASSEMBLEE_NATIONALE", url: "https://www.assemblee-nationale.fr/dyn/17/a" },
      { source: "ASSEMBLEE_NATIONALE", url: "https://www.assemblee-nationale.fr/dyn/16/a" },
    ]);
    expect(links).toHaveLength(2);
  });
});
