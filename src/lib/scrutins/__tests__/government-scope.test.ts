import { describe, expect, it } from "vitest";
import { getGovernmentScopeExclusion, getWholeBillKind } from "../government-scope";
import type { ResolveOutcome } from "@/services/sync/reconcile-scrutin-dossier/resolve";

const link: ResolveOutcome = {
  resolvedDossierExternalId: "DLR5L17N1",
  resolution: "VOTE_REF",
  candidateExternalIds: ["DLR5L17N1"],
};
const title = "l'ensemble du projet de loi de finances (première lecture).";

describe("government whole-bill audit scope (synthetic fixtures)", () => {
  it.each([
    title,
    "l’ensemble du projet de loi organique relatif à Mayotte (texte de la commission mixte paritaire).",
    "l'ensemble du projet de loi constitutionnelle (lecture définitive).",
  ])("recognizes a whole project: %s", (value) => {
    expect(getWholeBillKind(value)).toBe("projet");
  });
  it.each([
    "la première partie du projet de loi de finances.",
    "l'ensemble de la deuxième partie du projet de loi de financement de la sécurité sociale.",
    "l'amendement portant sur l'ensemble du projet de loi.",
    "la motion de rejet préalable de l'ensemble du projet de loi.",
    "l'article premier du projet de loi.",
    "la déclaration du Gouvernement.",
  ])("does not confuse procedure or a partial vote with a whole bill: %s", (value) => {
    expect(getWholeBillKind(value)).toBeNull();
  });
  it("keeps parliamentary proposals outside the comparison", () => {
    expect(
      getGovernmentScopeExclusion("l'ensemble de la proposition de loi.", link, "PARLEMENTAIRE")
    ).toBe("PARLIAMENTARY_BILL");
  });
  it("does not treat a session-only or heuristic link as confirmed", () => {
    for (const resolution of ["SINGLE_SESSION", "TITLE_MATCH"] as const) {
      expect(getGovernmentScopeExclusion(title, { ...link, resolution }, "GOUVERNEMENTALE")).toBe(
        "DOSSIER_LINK_REQUIRES_REVIEW"
      );
    }
  });
  it("accepts the dossier reference carried by the official scrutin payload", () => {
    expect(
      getGovernmentScopeExclusion(
        title,
        { resolvedDossierExternalId: "DLR5L17N1", resolution: "OFFICIAL_DOSSIER_REF" },
        "GOUVERNEMENTALE"
      )
    ).toBeNull();
  });
  it("distinguishes missing, conflicting and confirmed origin", () => {
    expect(getGovernmentScopeExclusion(title, link, undefined)).toBe("ORIGIN_UNDETERMINED");
    expect(getGovernmentScopeExclusion(title, link, "PARLEMENTAIRE")).toBe("ORIGIN_CONFLICT");
    expect(getGovernmentScopeExclusion(title, link, "GOUVERNEMENTALE")).toBeNull();
    expect(
      getGovernmentScopeExclusion(
        title,
        { ...link, resolvedDossierExternalId: null },
        "GOUVERNEMENTALE"
      )
    ).toBe("DOSSIER_UNRESOLVED");
  });
});
