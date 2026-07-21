import { describe, it, expect } from "vitest";
import { buildDossierMaps, parseDossierJson, type ParsedDossier } from "../maps";

const DRONE: ParsedDossier = {
  externalId: "DLR5L17N50636",
  titre:
    "Améliorer le traitement des maladies affectant les cultures végétales à l'aide d'aéronefs télépilotés",
  titreChemin: "traitement_maladies_cultures_aeronefs",
  reunionRefs: ["RU-SHARED", "RU-DRONE-ONLY"],
  voteRefs: ["VTANR5L17V617"],
};
const FRAUDES: ParsedDossier = {
  externalId: "DLR5L17N50715",
  titre: "Contre toutes les fraudes aux aides publiques",
  titreChemin: "contre_fraudes_aides_publiques",
  reunionRefs: ["RU-SHARED"],
  voteRefs: ["VTANR5L17V653"],
};

describe("buildDossierMaps", () => {
  it("maps a shared séance to all candidate dossiers", () => {
    const m = buildDossierMaps([DRONE, FRAUDES]);
    expect(m.reunionToDossiers.get("RU-SHARED")).toEqual(["DLR5L17N50636", "DLR5L17N50715"]);
    expect(m.reunionToDossiers.get("RU-DRONE-ONLY")).toEqual(["DLR5L17N50636"]);
  });

  it("voteRef map is a Set per scrutin (fails closed on collision)", () => {
    const m = buildDossierMaps([DRONE, { ...FRAUDES, voteRefs: ["VTANR5L17V617"] }]);
    expect(m.voteRefToDossiers.get("VTANR5L17V617")!.size).toBe(2);
  });

  it("aliases include titre + titreChemin token sets", () => {
    const m = buildDossierMaps([FRAUDES]);
    const aliases = m.dossierAliases.get("DLR5L17N50715")!;
    expect(aliases.some((s) => s.has("fraudes") && s.has("aides"))).toBe(true);
  });
});

describe("parseDossierJson", () => {
  it("extracts reunionRefs and voteRefs from nested actesLegislatifs", () => {
    const raw = {
      dossierParlementaire: {
        uid: "DLR5L17N50636",
        titreDossier: { titre: "Titre", titreChemin: "titre_chemin" },
        actesLegislatifs: {
          acteLegislatif: [
            { codeActe: "AN1-DEBATS-SEANCE", reunionRef: "RU-1" },
            {
              codeActe: "AN1-DEBATS-DEC",
              reunionRef: "RU-1",
              voteRefs: { voteRef: "VTANR5L17V617" },
              actesLegislatifs: {
                acteLegislatif: { codeActe: "X", reunionRef: "RU-2" },
              },
            },
          ],
        },
      },
    };
    const p = parseDossierJson(raw)!;
    expect(p.externalId).toBe("DLR5L17N50636");
    expect(p.titre).toBe("Titre");
    expect(p.reunionRefs.sort()).toEqual(["RU-1", "RU-2"]);
    expect(p.voteRefs).toEqual(["VTANR5L17V617"]);
  });

  it("returns null on a malformed dossier", () => {
    expect(parseDossierJson({})).toBeNull();
  });
});
