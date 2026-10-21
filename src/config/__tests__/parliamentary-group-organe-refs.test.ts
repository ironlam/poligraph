import { describe, expect, it } from "vitest";
import {
  ASSEMBLY_GROUP_ORGANE_REFS,
  ASSEMBLY_ORGANE_REFS_SOURCE_URL,
  getAssemblyGroupOrganeRefs,
} from "../parliamentaryGroups";
import { parseAnOrgan } from "@/lib/parlement/an-organes";
import fixture from "./fixtures/an17-organes.json";

describe("références officielles des groupes AN", () => {
  it("résout chaque référence avec le même parseur que l'import AnOrgan", () => {
    const organes = fixture.organes.map((raw) => {
      const result = parseAnOrgan(raw, [17]);
      if (!("row" in result)) throw new Error(`Organe rejeté : ${result.skipped}`);
      return result.row;
    });
    const refs = Object.values(ASSEMBLY_GROUP_ORGANE_REFS).flat();

    expect(fixture.sourceUrl).toBe(ASSEMBLY_ORGANE_REFS_SOURCE_URL);
    expect(new Set(refs.map((ref) => ref.organeRef)).size).toBe(refs.length);
    expect(refs.map((ref) => ref.organeRef).sort()).toEqual(
      organes.map((organ) => organ.organeRef).sort()
    );
    for (const [code, entries] of Object.entries(ASSEMBLY_GROUP_ORGANE_REFS)) {
      for (const ref of entries) {
        const organ = organes.find((entry) => entry.organeRef === ref.organeRef);
        expect(organ?.legislature).toBe(ref.legislature);
        expect(organ?.abbreviation?.toUpperCase()).toBe(code.toUpperCase());
        expect(ref).not.toHaveProperty("activeFrom");
        expect(ref).not.toHaveProperty("activeTo");
      }
    }
  });

  it("conserve les deux identités UDR dont les périodes sont portées par AnOrgan", () => {
    expect(getAssemblyGroupOrganeRefs("UDR", 17)).toEqual(["PO847173", "PO872880"]);
    expect(getAssemblyGroupOrganeRefs("UDR", 16)).toEqual([]);
    expect(getAssemblyGroupOrganeRefs("RN", 17)).toEqual(["PO845401"]);
  });

  it("normalise l'alias UDDPLR vers le groupe UDR", () => {
    expect(getAssemblyGroupOrganeRefs("UDDPLR", 17)).toEqual(getAssemblyGroupOrganeRefs("UDR", 17));
  });
});
