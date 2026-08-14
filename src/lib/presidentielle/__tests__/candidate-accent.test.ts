import { describe, expect, it } from "vitest";
import { resolveCandidateAccentColor, type CandidateAccentInput } from "../candidate-accent";

function input(over: Partial<CandidateAccentInput> = {}): CandidateAccentInput {
  return {
    accentColor: null,
    candidacyParty: null,
    partyLabel: null,
    currentParty: null,
    ...over,
  };
}

describe("resolveCandidateAccentColor", () => {
  it("préfère l'accent éditorial à toute couleur déduite", () => {
    const color = resolveCandidateAccentColor(
      input({
        accentColor: "#123456",
        candidacyParty: { color: "#abcdef" },
        partyLabel: "PS",
        currentParty: { color: "#ff8080", name: "Parti socialiste", shortName: "PS" },
      })
    );

    expect(color).toBe("#123456");
  });

  it("prend la couleur du parti sous lequel la candidature est déposée", () => {
    const color = resolveCandidateAccentColor(
      input({ candidacyParty: { color: "#0d378a" }, partyLabel: "RN" })
    );

    expect(color).toBe("#0d378a");
  });

  it("retombe sur le parti actuel quand le libellé de la candidature le nomme", () => {
    // La régression que ce test verrouille : les candidatures semées ne portent qu'un `partyLabel`
    // texte, sans `partyId` ni accent éditorial, donc sans cette étape chaque ligne du tableau
    // sujet affichait le même gris.
    const color = resolveCandidateAccentColor(
      input({
        partyLabel: "LFI",
        currentParty: { color: "#cc2443", name: "La France insoumise", shortName: "LFI" },
      })
    );

    expect(color).toBe("#cc2443");
  });

  it("accepte le nom complet du parti autant que son sigle, accents et casse compris", () => {
    const color = resolveCandidateAccentColor(
      input({
        partyLabel: "les ecologistes",
        currentParty: { color: "#00c000", name: "Les Écologistes", shortName: "EELV" },
      })
    );

    expect(color).toBe("#00c000");
  });

  it("refuse la couleur du parti actuel quand la candidature est déposée sous une autre étiquette", () => {
    // Le cas éditorial : une personne encartée quelque part se présente sous une autre bannière.
    // Peindre sa ligne aux couleurs du parti qu'elle ne porte pas serait une erreur factuelle.
    const color = resolveCandidateAccentColor(
      input({
        partyLabel: "Picardie Debout",
        currentParty: { color: "#cc2443", name: "La France insoumise", shortName: "LFI" },
      })
    );

    expect(color).toBeNull();
  });

  it("n'invente pas de couleur quand la candidature ne déclare aucune étiquette", () => {
    const color = resolveCandidateAccentColor(
      input({
        partyLabel: null,
        currentParty: { color: "#cc2443", name: "La France insoumise", shortName: "LFI" },
      })
    );

    expect(color).toBeNull();
  });

  it("renvoie null quand aucune source de couleur n'existe", () => {
    expect(resolveCandidateAccentColor(input({ partyLabel: "Divers" }))).toBeNull();
    expect(
      resolveCandidateAccentColor(
        input({
          partyLabel: "PS",
          currentParty: { color: null, name: "Parti socialiste", shortName: "PS" },
        })
      )
    ).toBeNull();
  });
});
