import { describe, it, expect } from "vitest";
import { verdictFilterOptions } from "@/components/factchecks/factchecks-filter-options";

describe("verdictFilterOptions", () => {
  it("additionne les verdicts d'un groupe et écarte ceux sans vérification", () => {
    const options = verdictFilterOptions({ FALSE: 3, MOSTLY_FALSE: 2, TRUE: 1 });
    const values = options.filter((o) => !o.disabled).map((o) => o.value);
    expect(options.find((o) => o.value === "faux")?.label).toBe("Faux / Plutôt faux (5)");
    expect(values).not.toContain("trompeur");
    expect(values).not.toContain("HALF_TRUE");
    expect(values).toContain("TRUE");
  });

  it("ne laisse que « Tous les verdicts » porter la valeur vide", () => {
    const empty = verdictFilterOptions({ FALSE: 1 }).filter((o) => o.value === "");
    expect(empty).toEqual([{ value: "", label: "Tous les verdicts" }]);
  });
});
