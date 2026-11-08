import { describe, it, expect } from "vitest";
import { assessCoherence } from "@/services/scrutin-substance/coherence";
import type { SubstanceTextBlock } from "@/services/scrutin-policy-title/types";
import {
  AMENDMENT_2084_CONTENT,
  AMENDMENT_2084_SUMMARY,
  POLICY_TITLE_2084,
  POLICY_SUBTITLE_2084,
  WRONG_CITIZEN_IMPACT,
  CORRECT_CITIZEN_IMPACT,
} from "@/services/__tests__/fixtures/scrutin-2084";

const amendmentBlocks: SubstanceTextBlock[] = [
  {
    sourceType: "amendment",
    sourceId: "amd-2084",
    field: "Amendment.content",
    text: AMENDMENT_2084_CONTENT,
    trust: "official",
    meta: { amendmentNumber: "2084", articleRef: "APRÈS L'ARTICLE 22" },
  },
  {
    sourceType: "amendment",
    sourceId: "amd-2084",
    field: "Amendment.summary",
    text: AMENDMENT_2084_SUMMARY,
    trust: "official",
    meta: { amendmentNumber: "2084", articleRef: "APRÈS L'ARTICLE 22" },
  },
];

describe("assessCoherence — scrutin 2084 regression (shared guard)", () => {
  it("flags the import-ban text as INCOHERENT with the cooperatives-transparency title", () => {
    const verdict = assessCoherence({
      text: WRONG_CITIZEN_IMPACT,
      policyTitle: POLICY_TITLE_2084,
      policySubtitle: POLICY_SUBTITLE_2084,
      blocks: amendmentBlocks,
    });
    expect(verdict.coherent).toBe(false);
  });

  it("accepts a text that actually describes the cooperatives-transparency measure", () => {
    const verdict = assessCoherence({
      text: CORRECT_CITIZEN_IMPACT,
      policyTitle: POLICY_TITLE_2084,
      policySubtitle: POLICY_SUBTITLE_2084,
      blocks: amendmentBlocks,
    });
    expect(verdict.coherent).toBe(true);
  });

  it("does not block when there is no official reference to compare against", () => {
    const verdict = assessCoherence({
      text: WRONG_CITIZEN_IMPACT,
      policyTitle: null,
      policySubtitle: null,
      blocks: [],
    });
    expect(verdict.coherent).toBe(true);
    expect(verdict.referenceUsed).toBe("none");
  });

  it("falls back to amendment blocks as the reference when no policy title exists", () => {
    const verdict = assessCoherence({
      text: WRONG_CITIZEN_IMPACT,
      policyTitle: null,
      policySubtitle: null,
      blocks: amendmentBlocks,
    });
    expect(verdict.referenceUsed).toBe("amendment");
    expect(verdict.coherent).toBe(false);
  });
});

describe("assessCoherence, debate anchored by the amendment number", () => {
  const legalBlocks: SubstanceTextBlock[] = [
    {
      sourceType: "amendment",
      sourceId: "amd-685",
      field: "Amendment.content",
      text: "À la première phrase du quatrième alinéa de l’article 1519 B du code général des impôts, le montant : « 20 511 € » est remplacé par le montant : « 82 044 € ».",
      trust: "official",
      meta: { amendmentNumber: "685", articleRef: "APRÈS L'ARTICLE 26" },
    },
  ];
  // Plain speech about the same measure: shares little with the legal wording.
  const plainDebate =
    "Nous proposons de quadrupler le montant de la taxe sur les éoliennes en mer, un impôt trop faible pour les mégaprojets.";

  it("blocks that debate with the default threshold", () => {
    const v = assessCoherence({ text: plainDebate, blocks: legalBlocks });
    expect(v.coherent).toBe(false);
    expect(v.coverage).toBeLessThan(0.3);
    expect(v.coverage).toBeGreaterThanOrEqual(0.1);
  });
  it("lets it through when the discussion is anchored", () => {
    expect(
      assessCoherence({ text: plainDebate, blocks: legalBlocks, anchored: true }).coherent
    ).toBe(true);
  });
  it("still blocks a passage with no shared vocabulary, even when anchored", () => {
    const v = assessCoherence({
      text: "Avis défavorable. Quel est l’avis du gouvernement ? Même avis.",
      blocks: legalBlocks,
      anchored: true,
    });
    expect(v.coherent).toBe(false);
  });
});
