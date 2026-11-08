import { describe, expect, it, vi } from "vitest";

// legislation.ts construit le client Prisma à l'import : la CI unit n'a pas de DATABASE_URL.
vi.mock("@/lib/db", () => ({ db: {} }));

import { determineStatus, generateShortTitle } from "@/services/sync/legislation";

const decisionActe = (code: string, date: string, libelle: string) => ({
  "@xsi:type": "Decision_Type",
  uid: `uid-${code}`,
  codeActe: code,
  libelleActe: { nomCanonique: "Décision" },
  organeRef: "PO838901",
  dateActe: date,
  statutConclusion: { fam_code: "TSORTF07", libelle },
});

describe("determineStatus après une décision", () => {
  it("PLF 2027 : décision « rejeté » du 04/11 = rejeté par une assemblée, navette poursuivie", () => {
    const actes = [
      decisionActe("AN1-DEBATS-DEC", "2026-11-04T00:00:00.000+01:00", "rejeté"),
    ] as never;
    const codes = ["AN1-DEPOT", "AN1-DEBATS-SEANCE", "AN1-DEBATS-DEC"];
    expect(
      determineStatus(codes, 17, { actes, procedure: "Projet de loi de finances de l'année" })
    ).toBe("REJETE_NAVETTE");
  });

  it("sans les actes, le même dossier reste « en discussion » (ancien comportement, régression)", () => {
    const codes = ["AN1-DEPOT", "AN1-DEBATS-SEANCE", "AN1-DEBATS-DEC"];
    expect(determineStatus(codes, 17)).toBe("EN_COURS");
  });

  it("proposition de loi rejetée à l'AN sans suite : rejeté", () => {
    const actes = [
      decisionActe("AN1-DEBATS-DEC", "2026-04-10T00:00:00.000+02:00", "rejetée"),
    ] as never;
    expect(
      determineStatus(["AN1-DEBATS-SEANCE", "AN1-DEBATS-DEC"], 17, {
        actes,
        procedure: "Proposition de loi ordinaire",
      })
    ).toBe("REJETE");
  });

  it("une promulgation l'emporte sur un rejet intermédiaire", () => {
    const actes = [
      decisionActe("AN1-DEBATS-DEC", "2025-11-21T00:00:00.000+01:00", "rejeté"),
    ] as never;
    expect(
      determineStatus(["AN1-DEBATS-DEC", "PROM-PUB"], 17, {
        actes,
        procedure: "Projet de loi de finances de l'année",
      })
    ).toBe("ADOPTE");
  });

  it("un texte adopté par une assemblée reste « en discussion »", () => {
    const actes = [
      decisionActe("AN1-DEBATS-DEC", "2026-04-10T00:00:00.000+02:00", "adopté"),
    ] as never;
    expect(
      determineStatus(["AN1-DEBATS-SEANCE", "AN1-DEBATS-DEC"], 17, {
        actes,
        procedure: "Projet de loi ordinaire",
      })
    ).toBe("EN_COURS");
  });
});

describe("generateShortTitle", () => {
  it("ne tronque pas « de finances » en « De finances »", () => {
    expect(generateShortTitle("Projet de loi de finances pour 2027")).toBe(
      "Projet de loi de finances pour 2027"
    );
    expect(
      generateShortTitle("Projet de loi de financement de la sécurité sociale pour 2027")
    ).toBe("Projet de loi de financement de la sécurité sociale pour 2027");
  });

  it("garde l'abréviation habituelle des autres titres", () => {
    expect(generateShortTitle("Projet de loi relatif à la lutte contre la fraude")).toBe(
      "La lutte contre la fraude"
    );
    expect(generateShortTitle("Proposition de loi visant à protéger les lanceurs d'alerte")).toBe(
      "Protéger les lanceurs d'alerte"
    );
  });
});
