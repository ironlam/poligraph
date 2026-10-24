import { describe, expect, it } from "vitest";
import {
  GLOSSAIRE_PARLEMENT,
  glossaireLettre,
  glossaireParLettre,
} from "@/config/glossaire-parlement";

describe("glossaire du Parlement", () => {
  it("uses unique ids and only references existing terms", () => {
    const ids = GLOSSAIRE_PARLEMENT.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of GLOSSAIRE_PARLEMENT) {
      for (const ref of t.voirAussi ?? []) expect(ids).toContain(ref);
    }
  });

  it("files accented terms under their base letter", () => {
    expect(glossaireLettre("Hémicycle")).toBe("H");
    expect(glossaireLettre("Séance publique")).toBe("S");
  });

  it("groups by letter in alphabetical order", () => {
    const groupes = glossaireParLettre();
    const lettres = groupes.map((g) => g.lettre);
    expect(lettres).toEqual([...lettres].sort((a, b) => a.localeCompare(b, "fr")));
    expect(groupes.reduce((n, g) => n + g.termes.length, 0)).toBe(GLOSSAIRE_PARLEMENT.length);
  });

  it("never uses em or en dashes", () => {
    expect(JSON.stringify(GLOSSAIRE_PARLEMENT)).not.toMatch(/[—–]/);
  });
});
