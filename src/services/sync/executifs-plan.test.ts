import { describe, expect, it } from "vitest";
import { Judgement, MatchMethod } from "@/generated/prisma";
import type { ResolveResult } from "@/lib/identity";
import {
  buildExecutifMandate,
  classifyExecutif,
  executifSourceId,
  parsePresidentRows,
  registreDepasse,
  type PresidentRow,
} from "./executifs-plan";

const record = (over: Record<string, string> = {}) => ({
  "Code du département": "19",
  "Code du canton": "1901",
  "Libellé du canton": "Allassac",
  "Nom de l'élu": "COSTE",
  "Prénom de l'élu": "Pascal",
  "Code sexe": "M",
  "Date de naissance": "1966-03-12",
  "Date de début du mandat": "2021-07-01",
  "Libellé de la fonction": "Président du conseil départemental",
  "Date de début de la fonction": "2021-07-01",
  ...over,
});

const result = (
  decision: ResolveResult["decision"],
  signals: Record<string, number> | null
): ResolveResult => ({
  sourceId: "s",
  politicianId: "pol-1",
  confidence: 0.99,
  method: MatchMethod.COMPOSITE,
  decision,
  blocked: false,
  candidates: signals
    ? [
        {
          politicianId: "pol-1",
          firstName: "Pascal",
          lastName: "Coste",
          birthDate: null,
          score: 0.99,
          method: MatchMethod.COMPOSITE,
          blocked: false,
          fellegiSunter: {
            compositeLogRatio: 20,
            confidence: 0.99,
            judgement: String(decision),
            primaryMethod: "COMPOSITE",
            signals: Object.entries(signals).map(([id, logLR]) => ({ id, logLR })),
          },
        },
      ]
    : [],
});

describe("parsePresidentRows", () => {
  it("garde le président avec sa date de naissance, pas les autres fonctions", () => {
    const rows = parsePresidentRows("DEPARTEMENTAL", [
      record(),
      record({ "Nom de l'élu": "DUPONT", "Libellé de la fonction": "1er Vice-président" }),
      record({
        "Nom de l'élu": "MARTIN",
        "Libellé de la fonction": "Président de commission du conseil départemental",
      }),
      record({ "Nom de l'élu": "DURAND", "Libellé de la fonction": "" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ lastName: "Coste", firstName: "Pascal", territoryCode: "19" });
    expect(rows[0]!.birthDate?.toISOString().slice(0, 10)).toBe("1966-03-12");
    expect(executifSourceId(rows[0]!)).toMatch(/^conseil:DEPARTEMENTAL:[0-9a-f]{64}$/);
  });
});

describe("classifyExecutif", () => {
  it("sans candidat : sans fiche", () => {
    expect(classifyExecutif(undefined)).toBe("SANS_FICHE");
  });

  it("SAME, prénom exact et date de naissance concordante : lien", () => {
    expect(classifyExecutif(result(Judgement.SAME, { "first-name": 3, birthdate: 14.8 }))).toBe(
      "LINK"
    );
  });

  // Vu en production le 2026-11-15 : un homonyme d'un autre prénom, né le même jour.
  it("SAME avec un autre prénom : revue, jamais de lien", () => {
    expect(classifyExecutif(result(Judgement.SAME, { "first-name": -5, birthdate: 14.8 }))).toBe(
      "REVIEW"
    );
  });

  it("SAME sans date de naissance sur la fiche : revue", () => {
    expect(classifyExecutif(result(Judgement.SAME, { "first-name": 3, birthdate: 0 }))).toBe(
      "REVIEW"
    );
  });

  it("UNDECIDED : revue si le prénom concorde, homonyme sinon", () => {
    expect(classifyExecutif(result(Judgement.UNDECIDED, { "first-name": 3, birthdate: -8 }))).toBe(
      "REVIEW"
    );
    expect(classifyExecutif(result(Judgement.UNDECIDED, { "first-name": -5, birthdate: 0 }))).toBe(
      "HOMONYME"
    );
  });

  it("décision SAME déjà confirmée (aucun candidat renvoyé) : lien", () => {
    expect(classifyExecutif(result(Judgement.SAME, null))).toBe("LINK");
  });
});

describe("buildExecutifMandate", () => {
  const row = (over: Partial<PresidentRow> = {}): PresidentRow => ({
    ...parsePresidentRows("DEPARTEMENTAL", [record()])[0]!,
    ...over,
  });

  it("département : code, nom entre parenthèses, date de début de la fonction", () => {
    expect(buildExecutifMandate(row())).toMatchObject({
      type: "PRESIDENT_DEPARTEMENT",
      title: "Président du conseil départemental (Corrèze)",
      departmentCode: "19",
    });
  });

  it("région : féminin, nom de la région en clé, pas de code département", () => {
    const mandate = buildExecutifMandate(
      row({ niveau: "REGIONAL", territoryCode: "76", gender: "F" })
    );
    expect(mandate).toMatchObject({
      type: "PRESIDENT_REGION",
      title: "Présidente du conseil régional (Occitanie)",
      constituency: "Occitanie",
      departmentCode: null,
    });
  });

  it("territoire inconnu ou date de début absente : rien", () => {
    expect(buildExecutifMandate(row({ territoryCode: "6AE" }))).toBeNull();
    expect(buildExecutifMandate(row({ functionStart: null, mandateStart: null }))).toBeNull();
  });
});

describe("registreDepasse", () => {
  const registre = new Date("2026-08-11T12:00:00Z");

  it("retient le lien quand un mandat parlementaire commence après le registre", () => {
    expect(registreDepasse(registre, [new Date("2026-10-01")])).toBe(true);
  });

  it("laisse passer un mandat parlementaire antérieur au registre, ou l'absence de mandat", () => {
    expect(registreDepasse(registre, [new Date("2024-07-08")])).toBe(false);
    expect(registreDepasse(registre, [])).toBe(false);
  });

  it("sans date de registre, tout mandat parlementaire courant retient le lien", () => {
    expect(registreDepasse(null, [new Date("2020-10-01")])).toBe(true);
    expect(registreDepasse(null, [])).toBe(false);
  });
});
