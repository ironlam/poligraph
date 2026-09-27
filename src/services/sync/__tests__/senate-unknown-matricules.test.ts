import { describe, expect, it } from "vitest";
import {
  assertNoUnknownSenateMatricules,
  mapUnknownMatricule,
  pickSenateMandateToUpdate,
  findUnknownMatricules,
  UnknownSenateMatriculesError,
} from "../senate-unknown-matricules";

describe("findUnknownMatricules", () => {
  it("retourne les matricules absents des ExternalId SENAT", () => {
    expect(findUnknownMatricules(["19001A", "26001X"], new Set(["19001A"]))).toEqual(["26001X"]);
  });

  it("ne retourne rien quand tous les matricules sont connus", () => {
    expect(findUnknownMatricules(["19001A"], new Set(["19001A"]))).toEqual([]);
  });
});

describe("assertNoUnknownSenateMatricules", () => {
  it("lève une erreur qui nomme chaque sénateur inconnu", () => {
    const run = () =>
      assertNoUnknownSenateMatricules([
        { matricule: "26001X", name: "Jeanne Exemple" },
        { matricule: "26002Y", name: "Paul Modèle" },
      ]);
    expect(run).toThrow(UnknownSenateMatriculesError);
    expect(run).toThrow(/Jeanne Exemple.*Paul Modèle/);
  });

  it("ne lève rien quand tous les matricules sont connus", () => {
    expect(() => assertNoUnknownSenateMatricules([])).not.toThrow();
  });
});

describe("mapUnknownMatricule", () => {
  const elected2026 = [
    {
      politicianId: "p-lamenie",
      name: "Marc LAMÉNIE",
      constituencyCode: "08",
      hasOpenedTerm: true,
    },
    { politicianId: "p-cadic", name: "Olivier CADIC", constituencyCode: "ZZ", hasOpenedTerm: true },
    { politicianId: null, name: "Paul MOUGENOT", constituencyCode: "02", hasOpenedTerm: false },
    {
      politicianId: "p-attente",
      name: "Jeanne ATTENTE",
      constituencyCode: "01",
      hasOpenedTerm: false,
    },
  ];
  const api = (prenom: string, nom: string, departmentCode: string | null) => ({
    matricule: "26001X",
    prenom,
    nom,
    departmentCode,
  });

  it("rattache malgré une graphie différente dans la bonne circonscription", () => {
    expect(mapUnknownMatricule(api("Marc", "Lamenie", "08"), elected2026)).toEqual({
      politicianId: "p-lamenie",
    });
  });

  it("rattache un Français établi hors de France (sans département)", () => {
    expect(mapUnknownMatricule(api("Olivier", "Cadic", null), elected2026)).toEqual({
      politicianId: "p-cadic",
    });
  });

  it("refuse un homonyme d'une autre circonscription", () => {
    expect(mapUnknownMatricule(api("Marc", "Laménie", "51"), elected2026)).toMatchObject({
      unresolved: true,
    });
  });

  it("refuse de choisir entre deux élus égaux", () => {
    const twice = [...elected2026, { ...elected2026[0]!, politicianId: "p-autre" }];
    expect(mapUnknownMatricule(api("Marc", "Laménie", "08"), twice)).toMatchObject({
      unresolved: true,
    });
  });

  it("refuse un élu sans fiche rattachée", () => {
    expect(mapUnknownMatricule(api("Paul", "Mougenot", "02"), elected2026)).toMatchObject({
      unresolved: true,
    });
  });

  it("refuse tant que le mandat 2026 n'est pas ouvert", () => {
    expect(mapUnknownMatricule(api("Jeanne", "Attente", "01"), elected2026)).toMatchObject({
      unresolved: true,
      reason: expect.stringMatching(/bascule/),
    });
  });
});

describe("pickSenateMandateToUpdate", () => {
  const m = (id: string, isCurrent: boolean, externalId: string | null, type = "SENATEUR") => ({
    id,
    type,
    isCurrent,
    externalId,
  });

  it("préfère le mandat courant à un ancien mandat fermé du même identifiant", () => {
    const picked = pickSenateMandateToUpdate(
      [m("ancien", false, "senat-1"), m("courant", true, null)],
      "senat-1"
    );
    expect(picked?.id).toBe("courant");
  });

  it("retombe sur l'identifiant quand aucun mandat n'est courant", () => {
    expect(pickSenateMandateToUpdate([m("ancien", false, "senat-1")], "senat-1")?.id).toBe(
      "ancien"
    );
  });

  it("ignore un mandat courant d'un autre type", () => {
    expect(pickSenateMandateToUpdate([m("maire", true, null, "MAIRE")], "senat-1")).toBeUndefined();
  });
});
