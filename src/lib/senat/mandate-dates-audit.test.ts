import { describe, it, expect } from "vitest";
import { auditMandate, parseElusen, matriculeOf, type DbMandate } from "./mandate-dates-audit";

const HEADER =
  "Matricule,Qualité,Nom usuel,Prénom usuel,État Sénateur,Identifiant mandat,Date d'élection,Date de début de mandat,Année de début de mandat,Motif début de mandat,Date de fin de mandat,Année de fin de mandat,Motif fin de mandat,Commentaire";

const CSV = [
  "% Requête :select s.senmat",
  "% where s.etasencod in ('ACTIF', 'ANCIEN')",
  HEADER,
  // un seul terme, en cours
  "AAA1A,M.,Dupont,Jean,ACTIF,1,2023-09-24 00:00:00.0,2023-10-02 00:00:00.0,,Election,,,,",
  // suppléant, commentaire avec virgule et guillemets
  'BBB2B,Mme,Martin,Claire,ACTIF,2,,2026-08-25 00:00:00.0,,Remplace,,,,"en remplacement de M. X, ""devenu"" ministre"',
  // deux termes successifs
  "CCC3C,M.,Durand,Paul,ACTIF,3,,1998-10-01 00:00:00.0,,Election,2008-09-30 00:00:00.0,,Fin de mandat,",
  "CCC3C,M.,Durand,Paul,ACTIF,4,,2008-10-01 00:00:00.0,,Renouvellement 1,,,,",
].join("\n");

const terms = parseElusen(CSV);

function mandate(over: Partial<DbMandate>): DbMandate {
  return {
    id: "m1",
    externalId: "senat-AAA1A",
    startDate: new Date("2023-10-02T00:00:00Z"),
    endDate: null,
    isCurrent: true,
    ...over,
  };
}

describe("parseElusen", () => {
  it("ignore les lignes de requête et groupe par matricule", () => {
    expect([...terms.keys()]).toEqual(["AAA1A", "BBB2B", "CCC3C"]);
    expect(terms.get("CCC3C")).toHaveLength(2);
    expect(terms.get("AAA1A")![0]).toMatchObject({ start: "2023-10-02", end: null });
  });

  it("lit les champs entre guillemets contenant une virgule", () => {
    expect(terms.get("BBB2B")![0]!.start).toBe("2026-08-25");
  });

  it("échoue si une colonne attendue disparaît", () => {
    expect(() => parseElusen("Matricule,Autre\nX,1")).toThrow(/Date de début de mandat/);
  });
});

describe("auditMandate", () => {
  it("accepte une date conforme", () => {
    expect(auditMandate(mandate({}), terms).status).toBe("OK");
  });

  it("repère le repli de série (2020-10-01 au lieu de la date officielle)", () => {
    const m = mandate({ startDate: new Date("2020-10-01T00:00:00Z") });
    const r = auditMandate(m, terms);
    expect(r.status).toBe("WRONG_START");
    expect(r.official?.start).toBe("2023-10-02");
  });

  it("repère un écart d'un jour", () => {
    const m = mandate({ startDate: new Date("2023-10-01T00:00:00Z") });
    expect(auditMandate(m, terms).status).toBe("WRONG_START");
  });

  it("repère un suppléant daté de la rentrée du renouvellement", () => {
    const m = mandate({
      externalId: "senat-BBB2B",
      startDate: new Date("2020-10-01T00:00:00Z"),
    });
    expect(auditMandate(m, terms).status).toBe("WRONG_START");
  });

  it("repère une fin de mandat fausse sur un mandat clos", () => {
    const m = mandate({
      externalId: "senat-CCC3C",
      startDate: new Date("1998-10-01T00:00:00Z"),
      endDate: new Date("2008-09-29T00:00:00Z"),
      isCurrent: false,
    });
    expect(auditMandate(m, terms).status).toBe("WRONG_END");
  });

  it("ne juge pas un mandat qui fusionne plusieurs termes", () => {
    const m = mandate({
      externalId: "senat-CCC3C",
      startDate: new Date("1998-10-01T00:00:00Z"),
    });
    expect(auditMandate(m, terms).status).toBe("MULTI_TERM");
  });

  it("ignore le terme précédent qui finit le jour du début (écart d'un jour)", () => {
    const m = mandate({
      externalId: "senat-CCC3C",
      startDate: new Date("2008-09-30T00:00:00Z"),
    });
    const r = auditMandate(m, terms);
    expect(r.status).toBe("WRONG_START");
    expect(r.official?.start).toBe("2008-10-01");
  });

  it("signale un matricule absent de la table", () => {
    expect(auditMandate(mandate({ externalId: "senat-ZZZ9Z" }), terms).status).toBe(
      "UNKNOWN_MATRICULE"
    );
  });

  it("signale un mandat sans terme officiel qui le recoupe", () => {
    const m = mandate({
      startDate: new Date("2010-01-01T00:00:00Z"),
      endDate: new Date("2012-01-01T00:00:00Z"),
      isCurrent: false,
    });
    expect(auditMandate(m, terms).status).toBe("NO_TERM");
  });
});

describe("matriculeOf", () => {
  it("extrait le matricule des identifiants senat-", () => {
    expect(matriculeOf("senat-14263U")).toBe("14263U");
    expect(matriculeOf("wikidata-Q1-Q14828018-2020")).toBeNull();
  });
});
