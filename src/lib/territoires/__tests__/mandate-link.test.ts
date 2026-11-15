import { describe, expect, it } from "vitest";
import { mandateCommuneLink, mandateDecisionsHref, mandateDepartementHref } from "../mandate-link";

const mandateTerritoireHref = (m: Parameters<typeof mandateCommuneLink>[0]) =>
  mandateCommuneLink(m)?.href ?? null;

const LINKED = { commune: { population: 46_000 } };

describe("mandateTerritoireHref", () => {
  it("relie un mandat local en cours à la page commune", () => {
    expect(
      mandateTerritoireHref({
        isCurrent: true,
        constituency: "Carcassonne (11069)",
        localData: LINKED,
      })
    ).toBe("/territoires/communes/11069");
  });

  it("accepte les codes corses", () => {
    expect(
      mandateTerritoireHref({ isCurrent: true, constituency: "Ajaccio (2A004)", localData: LINKED })
    ).toBe("/territoires/communes/2A004");
  });

  it("relie un mandat terminé en le marquant historique", () => {
    const past = { isCurrent: false, constituency: "Carcassonne (11069)", localData: LINKED };
    expect(mandateCommuneLink(past)).toEqual({
      href: "/territoires/communes/11069",
      historique: true,
    });
    expect(mandateCommuneLink({ ...past, isCurrent: true })?.historique).toBe(false);
  });

  it("ne relie pas un mandat sans commune en base", () => {
    expect(
      mandateTerritoireHref({
        isCurrent: true,
        constituency: "Carcassonne (11069)",
        localData: { commune: null },
      })
    ).toBeNull();
    expect(
      mandateTerritoireHref({ isCurrent: true, constituency: "Carcassonne (11069)" })
    ).toBeNull();
  });

  it("ne devine pas un code absent du libellé", () => {
    expect(
      mandateTerritoireHref({ isCurrent: true, constituency: "Agen", localData: LINKED })
    ).toBeNull();
    expect(
      mandateTerritoireHref({ isCurrent: true, constituency: "Rhône (3)", localData: LINKED })
    ).toBeNull();
  });
});

describe("mandateDecisionsHref", () => {
  const withDecisions = { commune: { population: 1200, decisionsCommuneId: "35238" } };

  it("links a municipal mandate, current or past, once a decision is published", () => {
    expect(mandateDecisionsHref({ type: "MAIRE", localData: withDecisions })).toBe(
      "/territoires/communes/35238/decisions"
    );
    expect(mandateDecisionsHref({ type: "CONSEILLER_MUNICIPAL", localData: withDecisions })).toBe(
      "/territoires/communes/35238/decisions"
    );
  });

  it("gives no link while the commune has no published decision", () => {
    expect(
      mandateDecisionsHref({ type: "MAIRE", localData: { commune: { population: 1200 } } })
    ).toBeNull();
    expect(mandateDecisionsHref({ type: "MAIRE", localData: null })).toBeNull();
  });

  it("never links a non-municipal mandate", () => {
    expect(mandateDecisionsHref({ type: "DEPUTE", localData: withDecisions })).toBeNull();
    expect(
      mandateDecisionsHref({ type: "MAIRE_ARRONDISSEMENT", localData: withDecisions })
    ).toBeNull();
  });
});

describe("mandateDepartementHref", () => {
  const depute = { type: "DEPUTE", isCurrent: true, departmentCode: "29" };

  it("relie le mandat en cours d'un député ou d'un sénateur à son département", () => {
    expect(mandateDepartementHref(depute)).toBe("/territoires/departements/finistere");
    expect(mandateDepartementHref({ ...depute, type: "SENATEUR", departmentCode: "2A" })).toBe(
      "/territoires/departements/corse-du-sud"
    );
  });

  it("ne relie ni un mandat terminé, ni un autre type de mandat", () => {
    expect(mandateDepartementHref({ ...depute, isCurrent: false })).toBeNull();
    expect(mandateDepartementHref({ ...depute, type: "MAIRE" })).toBeNull();
    expect(mandateDepartementHref({ ...depute, type: "DEPUTE_EUROPEEN" })).toBeNull();
  });

  it("ne devine pas de page pour un siège sans département", () => {
    expect(mandateDepartementHref({ ...depute, departmentCode: null })).toBeNull();
    expect(mandateDepartementHref({ ...depute, departmentCode: "ZZ" })).toBeNull();
  });
});
