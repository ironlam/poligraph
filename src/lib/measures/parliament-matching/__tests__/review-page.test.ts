import { describe, expect, it } from "vitest";
import { renderReviewPage, type ReviewProposal } from "../review-page";

function proposal(over: Partial<ReviewProposal> = {}): ReviewProposal {
  return {
    measureId: "m1",
    textId: "t1",
    measureSlug: "mesure-un",
    textSlug: "dossier-un",
    measureText: "Plafonner les frais bancaires",
    textTitle: "Plafonner et supprimer les frais bancaires injustes",
    tier: "A_EXAMINER",
    rank: 0,
    q: {
      kind: "BROADER_TEXT",
      confidence: "high",
      measureQuote: "Plafonner les frais bancaires",
      textQuote: "le plafonnement des frais bancaires est devenu une arlésienne",
      rationale: "Le texte encadre le dispositif.",
    },
    ...over,
  };
}

const stats = { measures: 2, pairs: 3 };

describe("renderReviewPage", () => {
  it("ne coche ni ne décide rien d'avance, même pour un lot prêt", () => {
    const html = renderReviewPage([proposal({ tier: "LOT_PRET" })], stats);
    expect(html).not.toMatch(/<input[^>]*\bchecked\b/);
    expect(html).not.toMatch(/<[^>]*\bdata-decided\b[^>]*>/);
  });

  it("affiche les trois onglets avec leurs compteurs", () => {
    const html = renderReviewPage(
      [
        proposal({ tier: "LOT_PRET" }),
        proposal({ measureId: "m2", tier: "A_EXAMINER" }),
        proposal({ measureId: "m3", tier: "A_EXAMINER" }),
        proposal({ measureId: "m4", tier: "REJETE" }),
      ],
      stats
    );
    expect(html).toContain("Prêts à relire (1)");
    expect(html).toContain("À examiner (2)");
    expect(html).toContain("Rejetés par les contrôles (1)");
    expect(html).toContain('data-total="3"');
  });

  it("regroupe les lignes d'un même dossier sous une case de lot", () => {
    const html = renderReviewPage(
      [proposal(), proposal({ measureId: "m2" }), proposal({ textId: "t2", textSlug: "autre" })],
      stats
    );
    expect(html.match(/class="chk all"/g)).toHaveLength(2);
    expect(html).toContain("2 mesure(s) proposée(s)");
  });

  it("signale une citation qui n'est que le titre du dossier", () => {
    const title = proposal({
      q: { ...proposal().q, textQuote: "Plafonner et supprimer les frais bancaires injustes" },
    });
    expect(renderReviewPage([title], stats)).toContain("Citation = titre du dossier");
    expect(renderReviewPage([proposal()], stats)).not.toContain("Citation = titre du dossier");
  });

  it("range un rapprochement refusé par le modèle dans les rejetés, sans citations", () => {
    const html = renderReviewPage(
      [
        proposal({
          tier: "REJETE",
          q: {
            kind: "NO_VOTE_IDENTIFIED",
            confidence: "high",
            measureQuote: "",
            textQuote: "",
            rationale: "Hors sujet.",
          },
        }),
      ],
      stats
    );
    expect(html).toContain("Aucun rapprochement identifié");
    expect(html).not.toContain("Dans la mesure");
  });

  it("échappe le contenu venu de la base", () => {
    const html = renderReviewPage(
      [
        proposal({
          measureText: '<img src=x onerror="alert(1)">',
          textTitle: "<script>x</script>",
        }),
      ],
      stats
    );
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&#60;img");
  });

  it("n'écrit aucun sens de vote", () => {
    const html = renderReviewPage([proposal()], stats).toLowerCase();
    expect(html).not.toMatch(/\b(pour|contre|abstention)\b[^<]{0,20}vote/);
  });

  it("affiche un état vide quand un onglet n'a aucune proposition", () => {
    expect(renderReviewPage([], stats)).toContain("Aucune proposition à relire.");
  });
});
