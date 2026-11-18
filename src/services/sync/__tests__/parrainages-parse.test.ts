import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MANDAT_BY_LABEL } from "@/config/parrainages";
import {
  PARRAINAGES_COLUMNS,
  parseParrainagesCsv,
  parsePublicationDate,
} from "../parrainages-parse";

/**
 * Real lines of the 2022 list (Conseil constitutionnel, data.gouv.fr, public domain): the header,
 * the first line carrying each of the 29 mandate labels, a commune with an apostrophe and a
 * hyphenated candidate name.
 */
const extrait = readFileSync(join(__dirname, "parrainages-2022-extrait.csv"), "utf8");
const HEADER = PARRAINAGES_COLUMNS.join(";");

describe("parseParrainagesCsv, extrait réel de la liste 2022", () => {
  const result = parseParrainagesCsv(extrait);

  it("lit toutes les lignes sans rejet ni mandat inconnu", () => {
    expect(result.rows).toHaveLength(31);
    expect(result.rejected).toEqual([]);
    expect(result.unknownMandateLabels).toEqual([]);
  });

  it("garde chaque valeur telle que publiée, guillemets retirés", () => {
    expect(result.rows[0]).toEqual({
      line: 2,
      civility: "M.",
      lastName: "CORDIVAL",
      firstName: "Gilles",
      mandateLabel: "Maire",
      mandat: "MAIRE",
      constituencyLabel: "Mont-Saint-Père",
      departmentLabel: "Aisne",
      candidateName: "ARTHAUD Nathalie",
      publishedOn: "2022-02-01",
    });
  });

  it("couvre les 29 libellés de la table de correspondance", () => {
    const labels = new Set(result.rows.map((row) => row.mandateLabel));
    expect([...labels].sort()).toEqual(Object.keys(MANDAT_BY_LABEL).sort());
    expect(labels.size).toBe(29);
  });

  it("regroupe le féminin et le masculin d'un même mandat sans toucher au libellé", () => {
    const byLabel = new Map(result.rows.map((row) => [row.mandateLabel, row.mandat]));
    for (const [masculin, feminin, mandat] of [
      ["Député", "Députée", "DEPUTE"],
      ["Sénateur", "Sénatrice", "SENATEUR"],
      ["Conseiller départemental", "Conseillère départementale", "CONSEILLER_DEPARTEMENTAL"],
      ["Conseiller régional", "Conseillère régionale", "CONSEILLER_REGIONAL"],
      ["Conseiller de Paris", "Conseillère de Paris", "CONSEILLER_PARIS"],
      [
        "Maire délégué d'une commune associée ou d'une commune déléguée",
        "Maire déléguée d'une commune associée ou d'une commune déléguée",
        "MAIRE_DELEGUE",
      ],
    ] as const) {
      expect(byLabel.get(masculin)).toBe(mandat);
      expect(byLabel.get(feminin)).toBe(mandat);
    }
  });

  it("conserve les apostrophes, les traits d'union et les virgules entre guillemets", () => {
    const find = (lastName: string) => result.rows.find((row) => row.lastName === lastName);
    expect(find("GUEYRAUD")?.constituencyLabel).toBe("Saint-Auban-d'Oze");
    expect(find("RETY")?.departmentLabel).toBe("Côte-d'Or");
    expect(find("GREHANT")?.candidateName).toBe("DUPONT-AIGNAN Nicolas");
    expect(find("OLIVIER")?.candidateName).toBe("LE PEN Marine");
    expect(find("TRESSARD")?.constituencyLabel).toBe("Autriche, Slovaquie, Slovénie");
  });

  it("laisse la circonscription vide quand la liste n'en publie pas", () => {
    const senateur = result.rows.find((row) => row.mandat === "SENATEUR");
    expect(senateur?.constituencyLabel).toBe("");
    expect(senateur?.departmentLabel).toBe("Meurthe-et-Moselle");
  });

  it("lit le même contenu avec ou sans BOM", () => {
    expect(parseParrainagesCsv(`﻿${extrait}`)).toEqual(result);
  });
});

describe("parseParrainagesCsv, cas limites", () => {
  const ligne = "M.;DUPONT;Jean;Maire;Trifouillis;Ain;MARTIN Claire;01/02/2022";

  it("refuse un fichier dont l'en-tête a changé", () => {
    expect(() => parseParrainagesCsv(`Nom;Prénom;Mandat\n${ligne}`)).toThrow(/En-tête inattendu/);
    expect(() => parseParrainagesCsv("")).toThrow(/En-tête inattendu/);
  });

  it("signale un libellé de mandat inconnu au lieu de le rapprocher", () => {
    const { rows, unknownMandateLabels } = parseParrainagesCsv(
      `${HEADER}\n${ligne.replace("Maire", "Maire honoraire")}`
    );
    expect(rows[0]?.mandat).toBeNull();
    expect(rows[0]?.mandateLabel).toBe("Maire honoraire");
    expect(unknownMandateLabels).toEqual(["Maire honoraire"]);
  });

  it("rejette une date illisible ou une valeur obligatoire vide, avec le numéro de ligne", () => {
    const { rows, rejected } = parseParrainagesCsv(
      [
        HEADER,
        ligne,
        ligne.replace("01/02/2022", "31/02/2022"),
        ligne.replace("01/02/2022", "2022-02-01"),
        ligne.replace("MARTIN Claire", ""),
        ligne.replace("Trifouillis", "Trifouillis;Bis"),
      ].join("\n")
    );
    expect(rows.map((row) => row.line)).toEqual([2]);
    expect(rejected).toEqual([
      { line: 3, reason: "date illisible : 31/02/2022" },
      { line: 4, reason: "date illisible : 2022-02-01" },
      { line: 5, reason: "colonne vide : Candidat" },
      { line: 6, reason: "nombre de colonnes : 9" },
    ]);
  });
});

describe("parsePublicationDate", () => {
  it("convertit jj/mm/aaaa en date ISO", () => {
    expect(parsePublicationDate("07/03/2022")).toBe("2022-03-07");
    expect(parsePublicationDate("29/02/2024")).toBe("2024-02-29");
  });

  it("rend null pour une date qui n'existe pas ou un autre format", () => {
    expect(parsePublicationDate("29/02/2022")).toBeNull();
    expect(parsePublicationDate("7/3/2022")).toBeNull();
    expect(parsePublicationDate("")).toBeNull();
  });
});
