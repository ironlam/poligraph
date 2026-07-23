import { describe, it, expect } from "vitest";
import { runValidators, quoteAppearsInText } from "@/services/scrutin-policy-title/validators";
import type { SubstanceTextBlock, EvidenceQuote } from "@/services/scrutin-policy-title/types";
import { BAD_TITLES, GOOD_TITLES } from "./productExamples.fixture";

const officialBlock = (over: Partial<SubstanceTextBlock> = {}): SubstanceTextBlock => ({
  sourceType: "subAmendment",
  sourceId: "a1",
  field: "Amendment.summary",
  text: "Le présent sous-amendement supprime une exonération aux règles de qualité de l'eau.",
  trust: "official",
  ...over,
});
const quote = (over: Partial<EvidenceQuote> = {}): EvidenceQuote => ({
  sourceType: "subAmendment",
  sourceId: "a1",
  field: "Amendment.summary",
  quote: "supprime une exonération aux règles de qualité de l'eau",
  ...over,
});

// A well-grounded GOOD case: title supported by an official sub block + a quote that exists in it.
function goodInput(title: string) {
  return {
    policyTitle: title,
    policySubtitle: null,
    evidenceQuotes: [quote()],
    blocks: [officialBlock()],
  };
}

describe("runValidators — product bad titles each raise the expected blocker", () => {
  for (const { title, expectBlocker } of BAD_TITLES) {
    it(`blocks: ${title}`, () => {
      const flags = runValidators(goodInput(title));
      expect(flags.some((f) => f.severity === "blocker" && f.code === expectBlocker)).toBe(true);
    });
  }
});

describe("runValidators — product good titles pass when grounded", () => {
  for (const title of GOOD_TITLES) {
    it(`passes: ${title}`, () => {
      const flags = runValidators(goodInput(title));
      expect(flags.some((f) => f.severity === "blocker")).toBe(false);
    });
  }
});

describe("runValidators — evidence + trust", () => {
  it("EVIDENCE_GROUNDING blocker when a quote cites a tuple not in the blocks", () => {
    const flags = runValidators({
      policyTitle: "Limiter les dérogations aux seuils de qualité de l'eau",
      policySubtitle: null,
      evidenceQuotes: [quote({ sourceId: "GHOST" })],
      blocks: [officialBlock()],
    });
    expect(flags.some((f) => f.severity === "blocker" && f.code === "EVIDENCE_GROUNDING")).toBe(
      true
    );
  });
  it("EVIDENCE_GROUNDING blocker when the quote text is fabricated (not in the source block)", () => {
    const flags = runValidators({
      policyTitle: "Limiter les dérogations aux seuils de qualité de l'eau",
      policySubtitle: null,
      evidenceQuotes: [quote({ quote: "texte totalement inventé qui n'existe pas" })],
      blocks: [officialBlock()],
    });
    expect(flags.some((f) => f.severity === "blocker" && f.code === "EVIDENCE_GROUNDING")).toBe(
      true
    );
  });
  it("EVIDENCE_GROUNDING blocker when there are no evidence quotes at all", () => {
    const flags = runValidators({
      policyTitle: "Limiter les dérogations aux seuils de qualité de l'eau",
      policySubtitle: null,
      evidenceQuotes: [],
      blocks: [officialBlock()],
    });
    expect(flags.some((f) => f.severity === "blocker" && f.code === "EVIDENCE_GROUNDING")).toBe(
      true
    );
  });
  it("EVIDENCE_TRUST blocker when a quote cites a non-official block", () => {
    const editorial = officialBlock({
      sourceId: "ed1",
      trust: "editorialContext",
      text: "contexte citoyen généré",
    });
    const flags = runValidators({
      policyTitle: "Limiter les dérogations aux seuils de qualité de l'eau",
      policySubtitle: null,
      evidenceQuotes: [quote({ sourceId: "ed1", quote: "contexte citoyen généré" })],
      blocks: [editorial],
    });
    expect(flags.some((f) => f.severity === "blocker" && f.code === "EVIDENCE_TRUST")).toBe(true);
  });
});

describe("quoteAppearsInText — ellipsis-stitched LLM quotes", () => {
  // Mistral routinely emits a quote that bridges two non-adjacent spans with an
  // "[...]" marker. The elided middle text still exists in the source, so a plain
  // substring match can never succeed even though the quote is faithfully grounded.
  const source =
    "Cette exigence permet : de prévenir tout risque d'interprétation abusive, d'assurer que la personne visée puisse comprendre les motifs invoqués et préparer utilement sa défense.";

  it("grounds a [...] quote when each fragment appears in order in the source", () => {
    const q =
      "Cette exigence permet : [...] d'assurer que la personne visée puisse comprendre les motifs invoqués";
    expect(quoteAppearsInText(q, source)).toBe(true);
  });

  it("does not ground a [...] quote when a fragment is absent from the source", () => {
    const q = "Cette exigence permet : [...] d'inventer une obligation qui n'existe pas";
    expect(quoteAppearsInText(q, source)).toBe(false);
  });

  it("does not ground a [...] quote when fragments appear out of order", () => {
    const q = "préparer utilement sa défense [...] Cette exigence permet";
    expect(quoteAppearsInText(q, source)).toBe(false);
  });

  it("runValidators clears EVIDENCE_GROUNDING for a grounded [...] quote", () => {
    const flags = runValidators({
      policyTitle: "Exiger une motivation écrite des circonstances exceptionnelles",
      policySubtitle: null,
      evidenceQuotes: [
        quote({
          quote:
            "Cette exigence permet : [...] d'assurer que la personne visée puisse comprendre les motifs invoqués",
        }),
      ],
      blocks: [officialBlock({ text: source })],
    });
    expect(flags.some((f) => f.severity === "blocker" && f.code === "EVIDENCE_GROUNDING")).toBe(
      false
    );
  });
});

describe("runValidators — SubTargetGrounding", () => {
  it("blocks when a non-empty SUB_AMENDMENT block exists but evidence cites only the parent", () => {
    const sub = officialBlock({
      sourceType: "subAmendment",
      sourceId: "sub1",
      text: "Le sous-amendement supprime l'exonération sur la qualité de l'eau.",
    });
    const parent = officialBlock({
      sourceType: "parentAmendment",
      sourceId: "par1",
      text: "Le parent crée un régime d'exonération sur l'eau.",
    });
    const flags = runValidators({
      policyTitle: "Créer un régime d'exonération sur l'eau",
      policySubtitle: null,
      evidenceQuotes: [
        quote({
          sourceType: "parentAmendment",
          sourceId: "par1",
          quote: "Le parent crée un régime d'exonération sur l'eau.",
        }),
      ],
      blocks: [sub, parent],
    });
    expect(flags.some((f) => f.severity === "blocker" && f.code === "SUB_TARGET_NOT_CITED")).toBe(
      true
    );
  });
  it("passes when the sub block IS cited", () => {
    const sub = officialBlock({
      sourceType: "subAmendment",
      sourceId: "sub1",
      text: "Le sous-amendement supprime l'exonération sur la qualité de l'eau.",
    });
    const flags = runValidators({
      policyTitle: "Supprimer l'exonération sur la qualité de l'eau",
      policySubtitle: null,
      evidenceQuotes: [
        quote({
          sourceType: "subAmendment",
          sourceId: "sub1",
          quote: "Le sous-amendement supprime l'exonération sur la qualité de l'eau.",
        }),
      ],
      blocks: [sub],
    });
    expect(flags.some((f) => f.code === "SUB_TARGET_NOT_CITED")).toBe(false);
  });
});

describe("runValidators — suppression polarity", () => {
  // A grounded suppression input: the official title carries "de suppression",
  // the amendment dispositif is the uniform "Supprimer cet article.", and the
  // summary block + quote keep the other validators satisfied.
  const contentBlock = officialBlock({
    sourceType: "amendment",
    sourceId: "amd1",
    field: "Amendment.content",
    text: "Supprimer cet article.",
  });
  function suppInput(title: string, over: { officialTitle?: string; withContent?: boolean } = {}) {
    const withContent = over.withContent ?? false;
    return {
      policyTitle: title,
      policySubtitle: null,
      evidenceQuotes: [quote()],
      blocks: withContent ? [officialBlock(), contentBlock] : [officialBlock()],
      officialTitle:
        over.officialTitle ??
        "l'amendement n° 937 de Mme Cathala de suppression de l'article 11 bis du projet de loi relatif à la protection des enfants (première lecture).",
    };
  }
  const hasSuppFlag = (flags: ReturnType<typeof runValidators>) =>
    flags.some((f) => f.severity === "blocker" && f.code === "SUPPRESSION_POLARITY");

  it("blocks a suppression titled with a creative verb (positive polarity)", () => {
    expect(hasSuppFlag(runValidators(suppInput("Autoriser un examen psychiatrique forcé")))).toBe(
      true
    );
  });

  it("passes a suppression titled with a removal verb", () => {
    expect(
      hasSuppFlag(runValidators(suppInput("Supprimer le régime de garde à vue de 72 heures")))
    ).toBe(false);
  });

  it("passes a suppression titled with a negation lead", () => {
    expect(
      hasSuppFlag(runValidators(suppInput("Ne pas créer la perpétuité pour viol sur mineur")))
    ).toBe(false);
  });

  it("passes a suppression titled with a status-quo lead (Maintenir)", () => {
    expect(
      hasSuppFlag(runValidators(suppInput("Maintenir les règles actuelles de placement")))
    ).toBe(false);
  });

  it("does NOT fire on a non-suppression scrutin titled with a creative verb", () => {
    expect(
      hasSuppFlag(
        runValidators(
          suppInput("Autoriser le partage d'informations", {
            officialTitle:
              "l'amendement n° 12 de Mme X portant sur l'article 5 du projet de loi (première lecture).",
          })
        )
      )
    ).toBe(false);
  });

  it("detects suppression from the dispositif when no official title is passed", () => {
    const flags = runValidators({
      policyTitle: "Prolonger la garde à vue à 72 heures",
      policySubtitle: null,
      evidenceQuotes: [quote()],
      blocks: [officialBlock(), contentBlock],
      // officialTitle intentionally omitted → fallback on the "Supprimer cet article." dispositif
    });
    expect(hasSuppFlag(flags)).toBe(true);
  });

  it("does NOT block a budgetary (PLF) suppression titled with a creative verb", () => {
    expect(
      hasSuppFlag(
        runValidators(
          suppInput("Augmenter de 301 millions d'euros les dotations aux communes", {
            officialTitle:
              "l'amendement n° 1277 de M. Le Coq de suppression de l'article 23 du projet de loi de finances pour 2026 (première lecture).",
          })
        )
      )
    ).toBe(false);
  });

  // Regression guard: the nine titles un-published on 2026-07-23 must all be caught.
  const DEPUBLISHED = [
    "Autoriser un examen psychiatrique forcé sur simple soupçon de menace",
    "Prolonger la garde à vue à 72 heures pour la criminalité organisée",
    "Rendre automatiques les sanctions pour fraude aux aides sociales",
    "Autoriser les agents des transports à saisir des stocks de marchandises dans leurs locaux",
    "Autoriser la suspension de permis bateau pour des délits douaniers en bande organisée",
    "Autoriser les agents des transports à verbaliser la vente à la sauvette en gares routières",
    "Autoriser les MDPH à échanger des données pour traquer la fraude sociale",
    "Élargir les avantages fiscaux pour les bailleurs privés",
    "Autoriser le démarchage téléphonique pour la livraison de produits alimentaires",
  ];
  for (const title of DEPUBLISHED) {
    it(`regression — blocks the inverted title: ${title.slice(0, 40)}…`, () => {
      expect(hasSuppFlag(runValidators(suppInput(title)))).toBe(true);
    });
  }
});

describe("runValidators — style", () => {
  it("ACCENTS blocker on missing French accents", () => {
    const flags = runValidators({
      policyTitle: "Limiter les derogations aux seuils de qualite de l'eau",
      policySubtitle: null,
      evidenceQuotes: [quote()],
      blocks: [officialBlock()],
    });
    expect(flags.some((f) => f.code === "ACCENTS")).toBe(true);
  });
  it("LENGTH blocker over 140 chars (warn 91-140)", () => {
    const long =
      "Limiter les dérogations aux seuils de qualité de l'eau " +
      "et renforcer les contrôles ".repeat(5);
    const flags = runValidators({
      policyTitle: long.slice(0, 160),
      policySubtitle: null,
      evidenceQuotes: [quote()],
      blocks: [officialBlock()],
    });
    expect(flags.some((f) => f.code === "LENGTH")).toBe(true);
  });
  it("NO_DASH warn on em-dash", () => {
    const flags = runValidators({
      policyTitle: "Limiter les dérogations — aux seuils de qualité",
      policySubtitle: null,
      evidenceQuotes: [quote()],
      blocks: [officialBlock()],
    });
    expect(flags.some((f) => f.code === "NO_DASH")).toBe(true);
  });
});
