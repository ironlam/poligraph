import { describe, expect, it } from "vitest";
import { matchElu, summarizeEluMatches, type MandateHolder } from "../parrainages-elus";

const holder = (over: Partial<MandateHolder> = {}): MandateHolder => ({
  politicianId: "p-martin",
  firstName: "Claire",
  lastName: "Martin",
  type: "MAIRE",
  communeId: "29019",
  departmentCode: "29",
  startDate: new Date("2020-05-28T00:00:00Z"),
  endDate: null,
  ...over,
});
const maire = {
  mandat: "MAIRE",
  lastName: "MARTIN",
  firstName: "Claire",
  publishedOn: "2022-02-08",
} as const;
const ici = { communeCode: "29019", departmentCode: "29" };

describe("matchElu, maire", () => {
  it("relie le maire de la commune à la date de publication, confirmé par le résolveur", () => {
    expect(matchElu(maire, ici, [holder()], "p-martin")).toMatchObject({
      verdict: "LINK",
      politicianId: "p-martin",
    });
  });

  it("ne relie pas sans l'accord du résolveur d'identité", () => {
    expect(matchElu(maire, ici, [holder()], null).verdict).toBe("REVIEW");
    expect(matchElu(maire, ici, [holder()], "p-autre").verdict).toBe("REVIEW");
  });

  it("ignore le maire actuel quand son mandat ne couvre pas la date", () => {
    const elueEn2026 = holder({ startDate: new Date("2026-03-22T00:00:00Z") });
    expect(matchElu(maire, ici, [elueEn2026], "p-martin")).toMatchObject({
      verdict: "SANS_MANDAT",
      politicianId: null,
    });
    const partieEn2021 = holder({ endDate: new Date("2021-06-30T00:00:00Z") });
    expect(matchElu(maire, ici, [partieEn2021], "p-martin").verdict).toBe("SANS_MANDAT");
  });

  it("ne relie jamais par le nom seul : même nom, autre commune", () => {
    const ailleurs = holder({ communeId: "35238" });
    expect(matchElu(maire, ici, [ailleurs], "p-martin")).toMatchObject({
      verdict: "SANS_MANDAT",
      politicianId: null,
    });
  });

  it("signale un autre maire en base à cette date, sans lien", () => {
    const autre = holder({ politicianId: "p-durand", firstName: "Paul", lastName: "Durand" });
    expect(matchElu(maire, ici, [autre], "p-martin")).toMatchObject({
      verdict: "AUTRE_TITULAIRE",
      politicianId: null,
    });
  });

  it("exige le prénom exact, accents et casse repliés", () => {
    expect(matchElu(maire, ici, [holder({ firstName: "CLAIRE" })], "p-martin").verdict).toBe(
      "LINK"
    );
    expect(matchElu(maire, ici, [holder({ firstName: "Marie-Claire" })], "p-martin").verdict).toBe(
      "AUTRE_TITULAIRE"
    );
  });

  it("ne choisit pas entre deux fiches du même nom", () => {
    const doublon = holder({ politicianId: "p-martin-bis" });
    expect(matchElu(maire, ici, [holder(), doublon], "p-martin")).toMatchObject({
      verdict: "REVIEW",
      politicianId: null,
    });
  });

  it("reste hors périmètre quand la commune n'est pas résolue", () => {
    const sansCommune = { communeCode: null, departmentCode: "29" };
    expect(matchElu(maire, sansCommune, [holder()], "p-martin").verdict).toBe("HORS_PERIMETRE");
  });
});

describe("matchElu, parlementaires", () => {
  const depute = { ...maire, mandat: "DEPUTE" } as const;
  const mandat = (over: Partial<MandateHolder> = {}) =>
    holder({
      type: "DEPUTE",
      communeId: null,
      startDate: new Date("2017-06-21T00:00:00Z"),
      ...over,
    });

  it("relie un député par son département", () => {
    expect(matchElu(depute, ici, [mandat()], "p-martin").verdict).toBe("LINK");
    expect(matchElu(depute, ici, [mandat({ departmentCode: "35" })], "p-martin").verdict).toBe(
      "SANS_MANDAT"
    );
  });

  it("renvoie à une relecture un mandat stocké sans département", () => {
    expect(matchElu(depute, ici, [mandat({ departmentCode: null })], "p-martin")).toMatchObject({
      verdict: "REVIEW",
      politicianId: "p-martin",
    });
  });

  it("ne déduit rien des autres députés du département", () => {
    const collegue = mandat({ politicianId: "p-durand", lastName: "Durand" });
    expect(matchElu(depute, ici, [collegue], null).verdict).toBe("SANS_MANDAT");
  });

  it("ne confond pas les types de mandat", () => {
    expect(matchElu({ ...maire, mandat: "SENATEUR" }, ici, [mandat()], "p-martin").verdict).toBe(
      "SANS_MANDAT"
    );
  });

  it("relie un député européen sans territoire", () => {
    const mep = mandat({ type: "DEPUTE_EUROPEEN", departmentCode: null });
    const nulle = { communeCode: null, departmentCode: null };
    expect(
      matchElu({ ...maire, mandat: "DEPUTE_EUROPEEN" }, nulle, [mep], "p-martin").verdict
    ).toBe("LINK");
  });
});

describe("matchElu, mandats non suivis", () => {
  it("laisse tels que publiés les mandats sans mandat daté en base", () => {
    for (const mandat of [
      "MAIRE_DELEGUE",
      "CONSEILLER_REGIONAL",
      "PRESIDENT_EPCI",
      null,
    ] as const) {
      expect(matchElu({ ...maire, mandat }, ici, [holder()], "p-martin")).toMatchObject({
        verdict: "HORS_PERIMETRE",
        politicianId: null,
      });
    }
  });

  it("compte chaque verdict", () => {
    const matches = [
      matchElu(maire, ici, [holder()], "p-martin"),
      matchElu(maire, ici, [holder()], null),
      matchElu(maire, ici, [], null),
    ];
    expect(summarizeEluMatches(matches)).toEqual({
      LINK: 1,
      REVIEW: 1,
      AUTRE_TITULAIRE: 0,
      SANS_MANDAT: 1,
      HORS_PERIMETRE: 0,
    });
  });
});
