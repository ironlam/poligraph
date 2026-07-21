import { describe, it, expect } from "vitest";
import { buildDossierMaps, type ParsedDossier } from "../maps";
import { resolveScrutinDossier } from "../resolve";

interface Case {
  title: string;
  seance: string;
  correct: string;
  wrong: string;
  dossiers: ParsedDossier[];
}

const CASES: Case[] = [
  {
    title:
      "l'amendement n° 6 de Mme Panot à l'article premier de la proposition de loi contre toutes les fraudes aux aides publiques (première lecture).",
    seance: "RU-A",
    correct: "FRAUDES",
    wrong: "DRONE",
    dossiers: [
      {
        externalId: "FRAUDES",
        titre: "Contre toutes les fraudes aux aides publiques",
        reunionRefs: ["RU-A"],
        voteRefs: [],
      },
      {
        externalId: "DRONE",
        titre:
          "Améliorer le traitement des maladies affectant les cultures végétales à l'aide d'aéronefs télépilotés",
        reunionRefs: ["RU-A"],
        voteRefs: [],
      },
    ],
  },
  {
    title:
      "l'amendement n° 34 de Mme Oziol de suppression de l'article 3 de la proposition de loi pour un démarchage téléphonique consenti et une protection renforcée des consommateurs contre les abus",
    seance: "RU-B",
    correct: "DEMARCHAGE",
    wrong: "SDIS",
    dossiers: [
      {
        externalId: "DEMARCHAGE",
        titre:
          "Pour un démarchage téléphonique consenti et une protection renforcée des consommateurs",
        reunionRefs: ["RU-B"],
        voteRefs: [],
      },
      {
        externalId: "SDIS",
        titre:
          "Création du cadre d'emploi des personnels de santé des services d'incendie et de secours",
        reunionRefs: ["RU-B"],
        voteRefs: [],
      },
    ],
  },
  {
    title:
      "l'amendement n° 24 de M. Loubet à l'article premier de la proposition de loi visant à lever dans les territoires d'outre-mer l'interdiction de recherche, d'exploration et d'exploitation des hydrocarbures",
    seance: "RU-C",
    correct: "HYDRO",
    wrong: "ARCELOR",
    dossiers: [
      {
        externalId: "HYDRO",
        titre:
          "Lever dans les territoires d'outre-mer l'interdiction de recherche, d'exploration et d'exploitation des hydrocarbures",
        reunionRefs: ["RU-C"],
        voteRefs: [],
      },
      {
        externalId: "ARCELOR",
        titre: "Nationalisation d'ArcelorMittal France",
        reunionRefs: ["RU-C"],
        voteRefs: [],
      },
    ],
  },
  {
    title:
      "l'amendement n° 1 de M. Jean-Philippe Tanguy à l'article premier de la proposition de loi visant à la nationalisation d'ArcelorMittal France afin de préserver la souveraineté industrielle",
    seance: "RU-D",
    correct: "ARCELOR2",
    wrong: "RETRAITES",
    dossiers: [
      {
        externalId: "ARCELOR2",
        titre: "Nationalisation d'ArcelorMittal France",
        reunionRefs: ["RU-D"],
        voteRefs: [],
      },
      {
        externalId: "RETRAITES",
        titre: "Renforcer la solidarité envers les retraités pauvres",
        reunionRefs: ["RU-D"],
        voteRefs: [],
      },
    ],
  },
];

describe("issue #477 regression fixtures", () => {
  for (const [i, c] of CASES.entries()) {
    it(`case ${i + 1} resolves to the correct dossier, not the collider`, () => {
      const r = resolveScrutinDossier(
        { uid: `V${i}`, seanceRef: c.seance, title: c.title },
        buildDossierMaps(c.dossiers)
      );
      expect(r.resolvedDossierExternalId).toBe(c.correct);
      expect(r.resolvedDossierExternalId).not.toBe(c.wrong);
    });
  }
});
