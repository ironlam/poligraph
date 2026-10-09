import { describe, expect, it } from "vitest";
import { classifyDossierOrigin } from "../origine";

function dossier(actesLegislatifs: unknown) {
  return { dossierParlementaire: { actesLegislatifs: { acteLegislatif: actesLegislatifs } } };
}

describe("classifyDossierOrigin", () => {
  it("uses the initial project deposit as the government signal", () => {
    const result = classifyDossierOrigin(
      dossier({
        codeActe: "AN1",
        "@xsi:type": "Etape_Type",
        actesLegislatifs: {
          acteLegislatif: {
            codeActe: "AN1-DEPOT",
            uid: "L17-VD220248DI",
            "@xsi:type": "DepotInitiative_Type",
            dateActe: "2024-07-19T00:00:00.000+02:00",
            texteAssocie: "PRJLANR5L17B0003",
            libelleActe: { nomCanonique: "Dépôt du projet de loi" },
          },
        },
      })
    );

    expect(result.origin).toBe("GOUVERNEMENTALE");
    expect(result.originDocumentRef).toBe("PRJLANR5L17B0003");
    expect(result.originReason).toBe("INITIAL_DEPOSIT_PRJL");
    expect(result.originEvidence).toMatchObject({
      codeActe: "AN1-DEPOT",
      acteUid: "L17-VD220248DI",
      documentRef: "PRJLANR5L17B0003",
    });
  });

  it("uses the first initiative deposit and ignores navette deposits", () => {
    const result = classifyDossierOrigin(
      dossier([
        {
          codeActe: "SN1",
          actesLegislatifs: {
            acteLegislatif: [
              {
                codeActe: "SN1-DEPOT",
                uid: "L17-VD220242DI",
                "@xsi:type": "DepotInitiative_Type",
                dateActe: "2024-07-12T00:00:00.000+02:00",
                texteAssocie: "PIONSNR5S419B0735",
              },
              {
                codeActe: "AN1-DEPOT",
                uid: "L17-VD223625DIN",
                "@xsi:type": "DepotInitiativeNavette_Type",
                dateActe: "2025-02-05T00:00:00.000+01:00",
                texteAssocie: "PIONANR5L17B0907",
              },
            ],
          },
        },
      ])
    );

    expect(result.origin).toBe("PARLEMENTAIRE");
    expect(result.originDocumentRef).toBe("PIONSNR5S419B0735");
    expect(result.candidateDocumentRefs).toEqual(["PIONSNR5S419B0735"]);
  });

  it("recognizes parliamentary resolutions from PNRE documents", () => {
    const result = classifyDossierOrigin(
      dossier({
        codeActe: "ANLUNI-DEPOT",
        uid: "L17-VD220213DI",
        "@xsi:type": "DepotInitiative_Type",
        texteAssocie: "PNREANR5L17B0185",
      })
    );

    expect(result.origin).toBe("PARLEMENTAIRE");
    expect(result.originReason).toBe("INITIAL_DEPOSIT_PNRE");
  });

  it("fails closed when the initial act has no document reference", () => {
    const result = classifyDossierOrigin(
      dossier({
        codeActe: "AN1-DEPOT",
        "@xsi:type": "DepotInitiative_Type",
      })
    );

    expect(result.origin).toBe("INDETERMINEE");
    expect(result.originReason).toBe("INITIAL_DEPOSIT_MISSING_DOCUMENT");
    expect(result.originEvidence?.codeActe).toBe("AN1-DEPOT");
  });

  it("does not infer origin from a later document or procedure-like shape", () => {
    const result = classifyDossierOrigin({
      dossierParlementaire: {
        titreDossier: { titre: "Projet de loi ordinaire" },
        actesLegislatifs: {
          acteLegislatif: {
            codeActe: "AN1-COM-FOND-RAPPORT",
            "@xsi:type": "DepotRapport_Type",
            texteAssocie: "PRJLANR5L17B9999",
          },
        },
      },
    });

    expect(result.origin).toBe("INDETERMINEE");
    expect(result.originReason).toBe("NO_INITIAL_DEPOSIT");
    expect(result.originDocumentRef).toBeNull();
  });

  it("fails closed on conflicting initial deposits", () => {
    const result = classifyDossierOrigin(
      dossier([
        {
          codeActe: "AN1-DEPOT",
          uid: "initial-gov",
          "@xsi:type": "DepotInitiative_Type",
          dateActe: "2024-01-01",
          texteAssocie: "PRJLANR5L17B0001",
        },
        {
          codeActe: "SN1-DEPOT",
          uid: "initial-parliament",
          "@xsi:type": "DepotInitiative_Type",
          dateActe: "2024-01-02",
          texteAssocie: "PIONSNR5S419B0001",
        },
      ])
    );

    expect(result.origin).toBe("INDETERMINEE");
    expect(result.originReason).toBe("INITIAL_DEPOSIT_CONFLICT");
    expect(result.candidateDocumentRefs).toEqual(["PRJLANR5L17B0001", "PIONSNR5S419B0001"]);
  });

  it("does not treat the non-standardized dossier title as a second origin signal", () => {
    const result = classifyDossierOrigin({
      dossierParlementaire: {
        titreDossier: { titre: "Proposition de loi contredite par le document" },
        actesLegislatifs: {
          acteLegislatif: {
            codeActe: "AN1-DEPOT",
            "@xsi:type": "DepotInitiative_Type",
            texteAssocie: "PRJLANR5L17B0001",
          },
        },
      },
    });

    expect(result.origin).toBe("GOUVERNEMENTALE");
    expect(result.originReason).toBe("INITIAL_DEPOSIT_PRJL");
    expect(result.originDocumentRef).toBe("PRJLANR5L17B0001");
  });

  it("fails closed on an unknown document prefix", () => {
    const result = classifyDossierOrigin(
      dossier({
        codeActe: "AN1-DEPOT",
        "@xsi:type": "DepotInitiative_Type",
        texteAssocie: "UNKNOWN-ANR5L17B0001",
      })
    );

    expect(result.origin).toBe("INDETERMINEE");
    expect(result.originReason).toBe("INITIAL_DEPOSIT_UNKNOWN_DOCUMENT_PREFIX");
  });
});
