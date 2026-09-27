import { describe, expect, it } from "vitest";
import {
  assertNoUnknownSenateMatricules,
  mapUnknownMatricule,
  keepExistingStartDate,
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

  it("met à jour le mandat courant, même si un ancien mandat fermé porte l'identifiant", () => {
    expect(
      pickSenateMandateToUpdate(
        [m("ancien", false, "senat-1"), m("courant", true, null)],
        "senat-1"
      )
    ).toEqual({ kind: "update", mandate: expect.objectContaining({ id: "courant" }) });
  });

  it("ne rouvre jamais un mandat fermé : le sénateur est sauté", () => {
    expect(pickSenateMandateToUpdate([m("ancien", false, "senat-1")], "senat-1")).toEqual({
      kind: "skip",
    });
  });

  it("crée un mandat quand la personne n'en a jamais eu au Sénat", () => {
    expect(pickSenateMandateToUpdate([m("maire", true, null, "MAIRE")], "senat-1")).toEqual({
      kind: "create",
    });
  });
});

describe("keepExistingStartDate", () => {
  const d = (iso: string) => new Date(iso);

  it("garde la date existante quand l'API n'en donne pas", () => {
    expect(keepExistingStartDate(d("2020-10-01T00:00:00Z"), null)).toBe(true);
  });

  it("laisse l'API corriger une date antérieure à 2026", () => {
    expect(keepExistingStartDate(d("2020-10-01T00:00:00Z"), d("2014-10-01T00:00:00Z"))).toBe(false);
  });

  it("protège un mandat 2026 contre la date d'un mandat précédent", () => {
    expect(keepExistingStartDate(d("2026-10-01T00:00:00Z"), d("2014-10-01T00:00:00Z"))).toBe(true);
  });

  it("accepte pour un mandat 2026 une date API du même mandat", () => {
    expect(keepExistingStartDate(d("2026-10-01T00:00:00Z"), d("2026-10-02T00:00:00Z"))).toBe(false);
  });
});
