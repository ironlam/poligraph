import { describe, expect, it } from "vitest";
import { isRejectionConclusion, rejectionStatus, type DecisionActe } from "../dossier-decision";

const FINANCES = "Projet de loi de finances de l'année";
const ORDINAIRE = "Proposition de loi ordinaire";

function decision(code: string, date: string, libelle: string | null): DecisionActe {
  return {
    codeActe: code,
    dateActe: date,
    statutConclusion: libelle === null ? null : { libelle },
  };
}

function act(code: string, date: string | null): DecisionActe {
  return { codeActe: code, dateActe: date };
}

describe("isRejectionConclusion", () => {
  it.each([
    "rejeté",
    "rejetée",
    "rejet du texte par la commission préalable",
    "considéré comme rejeté par l'Assemblée nationale en application de l'article 49, alinéa 3 de la Constitution",
  ])("reconnaît %s", (libelle) => {
    expect(isRejectionConclusion(libelle)).toBe(true);
  });

  it.each(["adopté", "adoptée sans modification", "Désaccord", "Conforme", null, ""])(
    "ne prend pas %s pour un rejet",
    (libelle) => {
      expect(isRejectionConclusion(libelle)).toBe(false);
    }
  );
});

describe("rejectionStatus", () => {
  it("PLF 2027 : première partie rejetée à l'AN, rien après, texte initial transmis au Sénat", () => {
    const actes = [
      act("AN1-DEPOT", "2026-10-01T00:00:00.000+02:00"),
      act("AN1-DEBATS-SEANCE", "2026-11-04T00:00:00.000+01:00"),
      decision("AN1-DEBATS-DEC", "2026-11-04T00:00:00.000+01:00", "rejeté"),
    ];
    expect(rejectionStatus(actes, FINANCES)).toBe("REJETE_NAVETTE");
  });

  it("une loi de finances rejetée en 1re lecture à l'AN suit sa navette même sans acte du Sénat", () => {
    const actes = [decision("AN1-DEBATS-DEC", "2025-11-21T00:00:00.000+01:00", "rejeté")];
    expect(rejectionStatus(actes, "Projet de loi de financement de la sécurité sociale")).toBe(
      "REJETE_NAVETTE"
    );
  });

  it("une loi de finances rejetée au Sénat sans suite connue reste simplement rejetée", () => {
    const actes = [decision("SN1-DEBATS-DEC", "2025-06-12T00:00:00.000+02:00", "rejetée")];
    expect(rejectionStatus(actes, FINANCES)).toBe("REJETE");
  });

  it("une proposition de loi rejetée à l'AN, rien après : rejet définitif", () => {
    const actes = [
      act("AN1-DEPOT", "2026-01-10T00:00:00.000+01:00"),
      decision("AN1-DEBATS-DEC", "2026-04-10T00:00:00.000+02:00", "rejetée"),
      act("AN1-DEBATS-SEANCE", "2026-04-10T00:00:00.000+02:00"),
    ];
    expect(rejectionStatus(actes, ORDINAIRE)).toBe("REJETE");
  });

  it("un rejet suivi d'un acte d'une autre étape (Sénat) : la navette continue", () => {
    const actes = [
      decision("AN1-DEBATS-DEC", "2026-06-09T00:00:00.000+02:00", "rejeté"),
      act("SN1-DEPOT", "2026-06-15T00:00:00.000+02:00"),
    ];
    expect(rejectionStatus(actes, "Projet de loi ordinaire")).toBe("REJETE_NAVETTE");
  });

  it("repère la décision dans les actes imbriqués", () => {
    const actes: DecisionActe[] = [
      {
        codeActe: "AN1",
        dateActe: null,
        actesLegislatifs: {
          acteLegislatif: [
            {
              codeActe: "AN1-DEBATS",
              dateActe: null,
              actesLegislatifs: {
                acteLegislatif: decision(
                  "AN1-DEBATS-DEC",
                  "2026-11-04T00:00:00.000+01:00",
                  "rejeté"
                ),
              },
            },
          ],
        },
      },
    ];
    expect(rejectionStatus(actes, FINANCES)).toBe("REJETE_NAVETTE");
  });

  it("une résolution rejetée en commission : rejet définitif", () => {
    const actes = [
      decision(
        "ANLUNI-COM-CAE-DEC",
        "2026-02-25T00:00:00.000+01:00",
        "rejet du texte par la commission préalable"
      ),
    ];
    expect(rejectionStatus(actes, "Résolution")).toBe("REJETE");
  });

  it("seule la dernière décision compte : un rejet suivi d'une adoption ne donne rien", () => {
    const actes = [
      decision("AN1-DEBATS-DEC", "2025-11-21T00:00:00.000+01:00", "rejeté"),
      decision("SN1-DEBATS-DEC", "2025-12-10T00:00:00.000+01:00", "adopté"),
    ];
    expect(rejectionStatus(actes, FINANCES)).toBeNull();
  });

  it("un dossier sans décision n'a pas de statut de rejet", () => {
    expect(
      rejectionStatus([act("AN1-DEPOT", "2026-01-10T00:00:00.000+01:00")], ORDINAIRE)
    ).toBeNull();
    expect(rejectionStatus(null, ORDINAIRE)).toBeNull();
  });

  it("ignore un acte de décision sans conclusion", () => {
    const actes = [decision("AN1-DEBATS-DEC", "2026-04-10T00:00:00.000+02:00", null)];
    expect(rejectionStatus(actes, ORDINAIRE)).toBeNull();
  });
});
