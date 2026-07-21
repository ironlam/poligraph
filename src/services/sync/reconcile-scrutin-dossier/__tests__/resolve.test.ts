import { describe, it, expect } from "vitest";
import { buildDossierMaps, type ParsedDossier } from "../maps";
import { resolveScrutinDossier } from "../resolve";

const DRONE: ParsedDossier = {
  externalId: "DRONE",
  titre:
    "Améliorer le traitement des maladies affectant les cultures végétales à l'aide d'aéronefs télépilotés",
  reunionRefs: ["RU-SHARED"],
  voteRefs: ["V-DRONE-ENSEMBLE"],
};
const FRAUDES: ParsedDossier = {
  externalId: "FRAUDES",
  titre: "Contre toutes les fraudes aux aides publiques",
  reunionRefs: ["RU-SHARED"],
  voteRefs: ["V-FRAUDES-ENSEMBLE"],
};
const maps = buildDossierMaps([DRONE, FRAUDES]);

describe("resolveScrutinDossier", () => {
  it("TITLE_MATCH separates a shared séance by bill phrase", () => {
    const r = resolveScrutinDossier(
      {
        uid: "V620",
        seanceRef: "RU-SHARED",
        title:
          "l'amendement n° 6 de Mme Panot à l'article premier de la proposition de loi contre toutes les fraudes aux aides publiques (première lecture).",
      },
      maps
    );
    expect(r.resolution).toBe("TITLE_MATCH");
    expect(r.resolvedDossierExternalId).toBe("FRAUDES");
    expect(r.candidateScores).toBeDefined();
    const scores = r.candidateScores!;
    expect(scores.map((c) => c.externalId)).toEqual(["FRAUDES", "DRONE"]);
    expect(scores[0]!.score).toBe(r.bestScore);
    expect(scores[0]!.score).toBeGreaterThanOrEqual(scores[1]!.score);
  });

  it("VOTE_REF overrides a misleading lexical title", () => {
    const r = resolveScrutinDossier(
      {
        uid: "V-DRONE-ENSEMBLE",
        seanceRef: "RU-SHARED",
        title: "l'ensemble de la proposition de loi contre toutes les fraudes aux aides publiques",
      },
      maps
    );
    expect(r.resolution).toBe("VOTE_REF");
    expect(r.resolvedDossierExternalId).toBe("DRONE");
  });

  it("duplicate voteRef fails closed to UNMATCHED", () => {
    const dup = buildDossierMaps([DRONE, { ...FRAUDES, voteRefs: ["V-DRONE-ENSEMBLE"] }]);
    const r = resolveScrutinDossier(
      { uid: "V-DRONE-ENSEMBLE", seanceRef: "RU-SHARED", title: "x" },
      dup
    );
    expect(r.resolution).toBe("UNMATCHED");
    expect(r.resolvedDossierExternalId).toBeNull();
  });

  it("single séance candidate assigns directly", () => {
    const solo = buildDossierMaps([{ ...FRAUDES, reunionRefs: ["RU-SOLO"] }]);
    const r = resolveScrutinDossier(
      { uid: "V1", seanceRef: "RU-SOLO", title: "peu importe" },
      solo
    );
    expect(r.resolution).toBe("SINGLE_SESSION");
    expect(r.resolvedDossierExternalId).toBe("FRAUDES");
  });

  it("insufficient margin stays AMBIGUOUS", () => {
    const a: ParsedDossier = {
      externalId: "A",
      titre: "réforme des transports urbains collectifs",
      reunionRefs: ["RU"],
      voteRefs: [],
    };
    const b: ParsedDossier = {
      externalId: "B",
      titre: "réforme des transports urbains individuels",
      reunionRefs: ["RU"],
      voteRefs: [],
    };
    const m = buildDossierMaps([a, b]);
    const r = resolveScrutinDossier(
      {
        uid: "V",
        seanceRef: "RU",
        title: "l'article 1 de la proposition de loi réforme des transports urbains",
      },
      m
    );
    expect(r.resolution).toBe("AMBIGUOUS");
    expect(r.resolvedDossierExternalId).toBeNull();
    expect(r.candidateScores).toBeDefined();
    const scores = r.candidateScores!;
    expect(scores.map((c) => c.externalId).sort()).toEqual(["A", "B"]);
    expect(scores[0]!.score).toBe(r.bestScore);
    expect(scores[0]!.score).toBeGreaterThanOrEqual(scores[1]!.score);
  });

  it("no séance candidate is UNMATCHED", () => {
    const r = resolveScrutinDossier({ uid: "V", seanceRef: "RU-UNKNOWN", title: "x" }, maps);
    expect(r.resolution).toBe("UNMATCHED");
  });
});
