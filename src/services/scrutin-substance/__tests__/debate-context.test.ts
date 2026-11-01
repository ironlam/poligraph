import { describe, it, expect } from "vitest";
import { findAmendmentMention } from "@/services/scrutin-substance/debate-context";

// Realistic AN séance snippet style: "l'amendement no <n>" (letter o, typographic ').
const filler = (label: string) => ` ${label} `.repeat(40);

describe("findAmendmentMention — HIGH (explicit number)", () => {
  it("matches an explicit 'amendement no 2084' → HIGH, usable, bounded excerpt", () => {
    const text = `M. le président : La parole est à Mme Léchon, pour soutenir l'amendement no 2084, qui impose la transparence de la répartition de la valeur dans les coopératives agricoles.`;
    const r = findAmendmentMention(text, [
      { number: "2084", authorSurname: "Lechon", article: "22" },
    ]);
    expect(r.confidence).toBe("HIGH");
    expect(r.usableForGeneration).toBe(true);
    expect(r.matchedAmendmentNumber).toBe("2084");
    expect(r.excerpt).toContain("2084");
    expect(r.excerpt!.length).toBeLessThan(text.length + 1);
  });

  it("handles variants: n°, numéro, nos X et Y, narrow/non-breaking spaces", () => {
    const variants = [
      "Sur l'amendement n° 2084, la commission donne un avis défavorable.",
      "L'amendement numéro 2084 est mis aux voix.",
      "Je mets aux voix les amendements nos 2080 et 2084.",
      "l'amendement no 2084 est adopté.", // non-breaking space
    ];
    for (const text of variants) {
      const r = findAmendmentMention(text, [{ number: "2084" }]);
      expect(r.confidence, text).toBe("HIGH");
    }
  });

  it("matches non purely-numeric amendment numbers (CL8, I-390, '600 (Rect)')", () => {
    expect(
      findAmendmentMention("Sur l'amendement no CL8, avis favorable.", [{ number: "CL8" }])
        .confidence
    ).toBe("HIGH");
    expect(
      findAmendmentMention("L'amendement no I-390 est retiré.", [{ number: "I-390" }]).confidence
    ).toBe("HIGH");
    expect(
      findAmendmentMention("Je mets aux voix l'amendement no 600.", [{ number: "600 (Rect)" }])
        .confidence
    ).toBe("HIGH");
  });

  it("does not match a number embedded in a longer number (2084 ≠ 20840 / 1691)", () => {
    const r = findAmendmentMention("Sur l'amendement no 1691 et l'amendement no 20840.", [
      { number: "2084" },
    ]);
    expect(r.confidence).not.toBe("HIGH");
  });
});

describe("findAmendmentMention — reject vague / absent", () => {
  it("rejects a same-dossier passage with no clear amendment mention → NONE", () => {
    const text =
      "Nous examinons le projet de loi d'urgence pour la souveraineté agricole, un texte attendu par la profession.";
    const r = findAmendmentMention(text, [
      { number: "2084", authorSurname: "Lechon", article: "22" },
    ]);
    expect(r.confidence).toBe("NONE");
    expect(r.usableForGeneration).toBe(false);
    expect(r.excerpt).toBeNull();
  });

  it("returns NONE on an empty transcript", () => {
    expect(findAmendmentMention("", [{ number: "2084" }]).confidence).toBe("NONE");
    expect(findAmendmentMention("   \n  ", [{ number: "2084" }]).confidence).toBe("NONE");
  });
});

describe("findAmendmentMention — multiple amendments in one séance", () => {
  it("bounds the excerpt around the right amendment, not its neighbours", () => {
    const text =
      `l'amendement no 2080 vise à interdire les importations de produits agricoles à bas prix.` +
      filler("blabla") +
      `l'amendement no 2084 impose la transparence de la répartition de la valeur dans les coopératives agricoles.` +
      filler("autre") +
      `l'amendement no 2090 concerne l'étiquetage.`;
    const r = findAmendmentMention(text, [{ number: "2084" }]);
    expect(r.confidence).toBe("HIGH");
    expect(r.matchedAmendmentNumber).toBe("2084");
    expect(r.excerpt).toContain("coopératives agricoles");
    expect(r.excerpt).not.toContain("interdire les importations");
    expect(r.excerpt).not.toContain("étiquetage");
  });
});

describe("findAmendmentMention — scrutin 2084 non-regression", () => {
  it("HIGH only when the debate genuinely mentions amendment 2084", () => {
    const text =
      "La parole est à Mme Léchon pour l'amendement no 2084 sur la transparence des coopératives.";
    expect(
      findAmendmentMention(text, [{ number: "2084", authorSurname: "Lechon" }]).confidence
    ).toBe("HIGH");
  });

  it("does NOT attribute a same-séance import-ban debate (other amendment) to 2084", () => {
    // The real 2026-05-30 transcript does not mention 2084/Léchon/article 22.
    const text =
      "Sur l'amendement no 249, M. Allisio défend l'interdiction des importations de produits agricoles à bas prix ne respectant pas les normes sociales et environnementales.";
    const r = findAmendmentMention(text, [
      { number: "2084", authorSurname: "Lechon", article: "22" },
    ]);
    expect(r.confidence).toBe("NONE");
    expect(r.usableForGeneration).toBe(false);
  });
});

describe("findAmendmentMention — real public AN séance formats", () => {
  // Verbatim excerpts from public Assemblée nationale séance transcripts.
  it("matches a number inside a real 'amendements nos X, Y, Z et W' list", () => {
    const text =
      "Mme la présidente : Sur les amendements nos 22, 25, 23 et 27, je suis saisie par le groupe La France insoumise-Nouveau Front populaire de demandes de scrutin public.";
    expect(findAmendmentMention(text, [{ number: "23" }]).confidence).toBe("HIGH");
    expect(findAmendmentMention(text, [{ number: "27" }]).confidence).toBe("HIGH");
    expect(findAmendmentMention(text, [{ number: "999" }]).confidence).toBe("NONE");
  });

  it("matches a real 'discussion commune' list 'amendements, nos 1403, 1984 et 1977'", () => {
    const text =
      "Nous en venons à trois amendements, nos 1403, 1984 et 1977, pouvant être soumis à une discussion commune. Sur l'amendement no 1403, je suis saisie d'une demande de scrutin public.";
    expect(findAmendmentMention(text, [{ number: "1403" }]).confidence).toBe("HIGH");
    expect(findAmendmentMention(text, [{ number: "1977" }]).confidence).toBe("HIGH");
  });
});

describe("findAmendmentMention — reinforced diagnostic (number + author/article)", () => {
  it("sets reinforced=true when the amendment number AND the author appear together", () => {
    const text =
      "La parole est à Mme Léchon pour soutenir l'amendement no 2084 sur la transparence des coopératives.";
    const r = findAmendmentMention(text, [
      { number: "2084", authorSurname: "Lechon", article: "22" },
    ]);
    expect(r.confidence).toBe("HIGH");
    expect(r.reinforced).toBe(true);
  });

  it("sets reinforced=true when the number AND the article appear together", () => {
    const text =
      "Sur l'amendement no 2084, à l'article 22, la commission donne un avis défavorable.";
    const r = findAmendmentMention(text, [{ number: "2084", article: "APRÈS L'ARTICLE 22" }]);
    expect(r.confidence).toBe("HIGH");
    expect(r.reinforced).toBe(true);
  });

  it("keeps reinforced=false on a bare number match (no author, no article nearby)", () => {
    const text = "L'amendement no 2084 est mis aux voix.";
    const r = findAmendmentMention(text, [
      { number: "2084", authorSurname: "Lechon", article: "22" },
    ]);
    expect(r.confidence).toBe("HIGH");
    expect(r.reinforced).toBe(false);
  });

  it("keeps reinforced=false for NONE / non-HIGH verdicts", () => {
    const none = findAmendmentMention("Discussion générale sans numéro.", [{ number: "2084" }]);
    expect(none.confidence).toBe("NONE");
    expect(none.reinforced).toBe(false);
  });
});

describe("findAmendmentMention — MEDIUM (author + article, no number)", () => {
  it("flags author + article co-located without the number as MEDIUM (audit only)", () => {
    const text =
      "Mme Léchon a longuement défendu, à l'article 22, une obligation de transparence pour les coopératives agricoles.";
    const r = findAmendmentMention(text, [
      { number: "2084", authorSurname: "Lechon", article: "APRÈS L'ARTICLE 22" },
    ]);
    expect(r.confidence).toBe("MEDIUM");
    expect(r.usableForGeneration).toBe(false);
  });
});

describe("findAmendmentMention — finance-bill parts (séance text drops the I-/II- prefix)", () => {
  const transcript =
    "Nous en venons à l'amendement no 1358 portant article additionnel après l'article 15, examiné par priorité. La parole est à M. Laurent Lhardit, pour soutenir l'amendement.";

  it("matches 'no 1358' to I-1358 when its article and author are cited nearby", () => {
    const r = findAmendmentMention(transcript, [
      {
        number: "I-1358",
        authorSurname: "Lhardit",
        article: "APRÈS L'ARTICLE 15, insérer l'article suivant:",
      },
    ]);
    expect(r.confidence).toBe("HIGH");
    expect(r.usableForGeneration).toBe(true);
    expect(r.matchedAmendmentNumber).toBe("I-1358");
  });

  it("does not credit the other part, whose article and author are absent", () => {
    const r = findAmendmentMention(transcript, [
      { number: "II-1358", authorSurname: "Dupont", article: "ARTICLE 58" },
    ]);
    expect(r.confidence).not.toBe("HIGH");
    expect(r.usableForGeneration).toBe(false);
  });

  it("does not accept a bare number nothing corroborates", () => {
    const r = findAmendmentMention("Je mets aux voix l'amendement no 1358.", [
      { number: "I-1358", authorSurname: "Lhardit", article: "APRÈS L'ARTICLE 15" },
    ]);
    expect(r.confidence).not.toBe("HIGH");
  });

  it("does not match a longer number (1358 is not 13580)", () => {
    const r = findAmendmentMention(
      "L'amendement no 13580 après l'article 15, présenté par M. Lhardit.",
      [{ number: "I-1358", authorSurname: "Lhardit", article: "APRÈS L'ARTICLE 15" }]
    );
    expect(r.confidence).not.toBe("HIGH");
  });

  it("still prefers an explicit prefixed mention", () => {
    const r = findAmendmentMention("Sur l'amendement no I-1358, avis défavorable.", [
      { number: "I-1358" },
    ]);
    expect(r.confidence).toBe("HIGH");
  });

  it("hands over the passage that follows a HIGH match, and nothing for a weaker one", () => {
    const speech = "M. Lhardit : cette taxe répond à une inégalité entre acteurs.";
    const high = findAmendmentMention(
      `Nous en venons à l'amendement no 1358 après l'article 15. ${speech}`,
      [{ number: "I-1358", authorSurname: "Lhardit", article: "APRÈS L'ARTICLE 15" }]
    );
    expect(high.context).toContain("répond à une inégalité");

    const medium = findAmendmentMention(
      "M. Lhardit présente un texte après l'article 15, sans numéro.",
      [{ number: "I-1358", authorSurname: "Lhardit", article: "APRÈS L'ARTICLE 15" }]
    );
    expect(medium.confidence).toBe("MEDIUM");
    expect(medium.context).toBeNull();
  });
});
