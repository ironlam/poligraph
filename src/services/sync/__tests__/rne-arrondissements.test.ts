import { describe, it, expect } from "vitest";
import { parseArrondissementRows, foldName } from "../rne-arrondissements-parse";

const HEADER =
  "Code du département;Libellé du département;Code de la commune;Libellé de la commune;" +
  "Libellé du secteur;Nom de l'élu;Prénom de l'élu;Code sexe;Date de naissance;" +
  "Code de la catégorie socio-professionnelle;Libellé de la catégorie socio-professionnelle;" +
  "Date de début du mandat;Libellé de la fonction;Date de début de la fonction";

const row = (fonction: string, secteur = "Paris 5Eme Secteur", nom = "MARTIN") =>
  `75;Paris;75056;Paris;${secteur};${nom};Alice;F;1970-04-02;33;Cadre;2026-03-22;${fonction};2026-04-05`;

describe("parseArrondissementRows", () => {
  it("retient les maires d'arrondissement", () => {
    const rows = parseArrondissementRows([HEADER, row("Maire d'arrondissement")].join("\n"));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.fullName).toBe("Alice MARTIN");
    expect(rows[0]!.communeId).toBe("75056");
    expect(rows[0]!.sectorLabel).toBe("Paris 5Eme Secteur");
  });

  it("écarte les adjoints, dont le libellé contient celui du maire", () => {
    // « 1er adjoint au maire d'arrondissement » inclut la chaîne recherchée :
    // une comparaison par inclusion importerait 611 adjoints comme maires.
    const csv = [
      HEADER,
      row("1er adjoint au maire d'arrondissement"),
      row("4ème adjoint au maire d'arrondissement"),
    ].join("\n");

    expect(parseArrondissementRows(csv)).toHaveLength(0);
  });

  it("écarte les conseillers sans fonction", () => {
    expect(parseArrondissementRows([HEADER, row("")].join("\n"))).toHaveLength(0);
  });

  it("lit la date de naissance, seul discriminant fiable des homonymes", () => {
    const rows = parseArrondissementRows([HEADER, row("Maire d'arrondissement")].join("\n"));

    // Comparé sur les composantes locales : la date vaut minuit à Paris, donc
    // son ISO est la veille à 23:00Z.
    expect(rows[0]!.birthDate?.getFullYear()).toBe(1970);
    expect(rows[0]!.birthDate?.getDate()).toBe(2);
  });

  it("garde les trois villes distinctes par leur secteur", () => {
    const csv = [
      HEADER,
      row("Maire d'arrondissement", "Paris 5Eme Secteur"),
      "69;Rhône;69123;Lyon;Lyon 3Eme Secteur;DUPONT;Benoît;M;1965-01-01;33;Cadre;2026-03-22;Maire d'arrondissement;2026-04-05",
      "13;Bouches-Du-Rhône;13055;Marseille;Marseille Secteur 1;ROUX;Claire;F;1980-09-12;33;Cadre;2026-03-22;Maire d'arrondissement;2026-04-05",
    ].join("\n");

    const rows = parseArrondissementRows(csv);

    expect(rows.map((r) => r.communeId)).toEqual(["75056", "69123", "13055"]);
    expect(rows.map((r) => r.sectorLabel)).toEqual([
      "Paris 5Eme Secteur",
      "Lyon 3Eme Secteur",
      "Marseille Secteur 1",
    ]);
  });
});

describe("foldName", () => {
  it("rapproche un patronyme crié et accentué de sa forme normale", () => {
    expect(foldName("BÉCARD")).toBe(foldName("Bécard"));
    expect(foldName("Frédéric-Joël")).toBe(foldName("frederic joel"));
  });

  it("ne confond pas deux noms différents", () => {
    expect(foldName("Martin")).not.toBe(foldName("Martini"));
  });
});

describe("format de date du RNE", () => {
  it("lit l'ISO, seul format encore publié", () => {
    const rows = parseArrondissementRows([HEADER, row("Maire d'arrondissement")].join("\n"));

    // Les 34 826 lignes de l'export d'août 2026 sont en YYYY-MM-DD ; aucune
    // en DD/MM/YYYY. Ne lire que l'ancien format annulait toutes les dates.
    expect(rows[0]!.birthDate).not.toBeNull();
    expect(rows[0]!.birthDate!.getFullYear()).toBe(1970);
    expect(rows[0]!.birthDate!.getMonth()).toBe(3);
    expect(rows[0]!.birthDate!.getDate()).toBe(2);
  });

  it("lit encore l'ancien format, au cas où un export le reprendrait", () => {
    const csv = [
      HEADER,
      "75;Paris;75056;Paris;Paris 5Eme Secteur;MARTIN;Alice;F;02/04/1970;33;Cadre;22/03/2026;Maire d'arrondissement;05/04/2026",
    ].join("\n");
    const rows = parseArrondissementRows(csv);

    expect(rows[0]!.birthDate!.getFullYear()).toBe(1970);
    expect(rows[0]!.birthDate!.getDate()).toBe(2);
  });
});
