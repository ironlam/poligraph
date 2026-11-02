import { describe, expect, it } from "vitest";
import { analyzeMeasureClarity } from "../clarity";

const rules = (text: string, details?: string | null, knownAcronyms?: Set<string>) =>
  analyzeMeasureClarity({ text, details }, { knownAcronyms }).map((finding) => finding.rule);

describe("contrôle de clarté d'une mesure", () => {
  it("signale un renvoi vague à « concernés »", () => {
    const findings = analyzeMeasureClarity({
      text: "Verser aux jeunes concernés une allocation qui leur donne 1 300 euros par mois.",
    });

    expect(findings).toEqual([
      expect.objectContaining({ rule: "RENVOI_VAGUE", match: "concernés", severity: "A_RELIRE" }),
    ]);
  });

  it("signale un pronom dont le référent est ambigu", () => {
    const text =
      "Exclure les élèves qui menacent élèves, étudiants ou professeurs, ces derniers devant trouver une institution.";

    expect(rules(text)).toContain("PRONOM_AMBIGU");
  });

  it("ne signale pas la formulation corrigée", () => {
    const text =
      "Exclure du lycée les élèves qui menacent élèves, étudiants ou professeurs, les exclus devant se trouver une institution.";

    expect(rules(text)).toEqual([]);
  });

  it("signale un texte trop court pour dire qui, quoi et combien", () => {
    expect(rules("Augmenter les bas salaires.")).toContain("TROP_COURT");
    // Short but with a figure: clear enough, no finding.
    expect(rules("Porter le SMIC à 2 000 euros.")).not.toContain("TROP_COURT");
    expect(rules("Abaisser la majorité pénale à 16 ans.")).toEqual([]);
    expect(rules("Augmenter de 10 % le SMIC dès la première année du mandat.")).not.toContain(
      "TROP_COURT"
    );
  });

  it("signale une quantité floue mais pas une quantité chiffrée", () => {
    expect(
      rules("Nationaliser certaines entreprises stratégiques pour éviter les scandales.")
    ).toContain("QUANTITE_FLOUE");
    expect(
      rules("Nationaliser trois entreprises stratégiques pour éviter les scandales.")
    ).not.toContain("QUANTITE_FLOUE");
  });

  describe("sigles", () => {
    it("signale un sigle qui n'est ni connu ni développé", () => {
      expect(rules("Augmenter l'APL de 10 % pour tous les locataires modestes du pays.")).toContain(
        "SIGLE_NON_DEFINI"
      );
    });

    it("accepte un sigle développé dans la phrase ou couvert par un repère publié", () => {
      expect(
        rules("Augmenter de 10 % l'aide personnalisée au logement (APL) pour les locataires.")
      ).toEqual([]);
      expect(
        rules(
          "Augmenter l'APL de 10 % pour tous les locataires modestes du pays.",
          null,
          new Set(["APL"])
        )
      ).toEqual([]);
    });

    it("ne signale pas les sigles que tout lecteur comprend", () => {
      expect(
        rules("Ramener la dette publique à 112 % du PIB et la contribution à l'UE à 5 milliards.")
      ).toEqual([]);
    });
  });

  it("ne lit que le texte : le contexte a le droit de porter des réserves", () => {
    const findings = analyzeMeasureClarity({
      text: "Réorienter l'épargne des Français vers l'investissement à hauteur de 100 milliards par an.",
      details: "Les bénéficiaires concernés ne sont pas précisés, ces derniers non plus.",
    });

    expect(findings).toEqual([]);
  });

  it("ne rapporte qu'une fois la même trouvaille", () => {
    const findings = analyzeMeasureClarity({
      text: "Aider les jeunes concernés et soutenir les adultes concernés par la réforme du lycée.",
    });

    expect(findings.filter((finding) => finding.rule === "RENVOI_VAGUE")).toHaveLength(1);
  });

  it("n'accroche pas un mot qui contient simplement la racine", () => {
    // « visées » est un renvoi vague, « devises » ou « concernement » n'en sont pas.
    expect(
      rules("Réformer le marché des devises étrangères pour stabiliser le prix de l'énergie.")
    ).toEqual([]);
  });
});
