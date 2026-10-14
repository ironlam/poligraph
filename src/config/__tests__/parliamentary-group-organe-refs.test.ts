import { describe, expect, it } from "vitest";
import { getAssemblyGroupOrganeRefs } from "../parliamentaryGroups";

describe("références officielles des groupes AN", () => {
  it("utilise la référence active à la date du scrutin", () => {
    expect(getAssemblyGroupOrganeRefs("RN", 17, new Date("2025-01-01T12:00:00Z"))).toEqual([
      "PO845401",
    ]);
    expect(getAssemblyGroupOrganeRefs("UDR", 17, new Date("2025-09-04T12:00:00Z"))).toEqual([
      "PO847173",
    ]);
    expect(getAssemblyGroupOrganeRefs("UDR", 17, new Date("2025-09-05T12:00:00Z"))).toEqual([
      "PO872880",
    ]);
  });

  it("normalise l'alias UDDPLR vers le groupe UDR", () => {
    expect(getAssemblyGroupOrganeRefs("UDDPLR", 17, new Date("2025-10-01T12:00:00Z"))).toEqual([
      "PO872880",
    ]);
  });
});
