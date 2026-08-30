import { describe, expect, it } from "vitest";
import { MEASURE_SUBTOPICS } from "@/config/measure-subtopics";
import {
  findDeltaLexicalMatches,
  selectDeterministicControlSample,
  selectSubtopicDeltaCandidates,
  type DeltaMeasureInput,
} from "@/lib/measures/subtopic-delta-selection";

const subtopic = MEASURE_SUBTOPICS.find((item) => item.slug === "racisme-antisemitisme")!;

function measure(id: string, overrides: Partial<DeltaMeasureInput> = {}): DeltaMeasureInput {
  return {
    measureId: id,
    revisionId: `revision-${id}`,
    sourceUpdatedAt: "2026-08-30T00:00:00.000Z",
    candidateName: "Candidate Exemple",
    theme: "SOCIETE_DROITS_LIBERTES",
    text: "Une mesure sans terme particulier.",
    details: null,
    existingAssignments: [],
    ...overrides,
  };
}

describe("sélection différentielle des sous-thèmes", () => {
  it("sélectionne par alias sans dépendre des accents ni du pluriel", () => {
    expect(
      findDeltaLexicalMatches(
        { text: "Lutter contre les actes antisémites.", details: null },
        subtopic
      )
    ).toContain("antisémite");
  });

  it("sélectionne une mesure rattachée à un sous-thème voisin", () => {
    const result = selectSubtopicDeltaCandidates({
      measures: [
        measure("neighbor", {
          existingAssignments: [{ slug: "egalite-discriminations", status: "APPROVED" }],
        }),
      ],
      subtopic,
      controlSampleMaximum: 0,
    });

    expect(result.candidates[0]?.selectionReasons).toContainEqual({
      signal: "NEIGHBOR_SUBTOPIC",
      values: ["egalite-discriminations"],
    });
  });

  it("produit un échantillon témoin déterministe", () => {
    const inputs = Array.from({ length: 100 }, (_, index) => measure(`measure-${index}`));
    const first = selectDeterministicControlSample(inputs, subtopic.slug);
    const second = selectDeterministicControlSample([...inputs].reverse(), subtopic.slug);

    expect(first).toHaveLength(2);
    expect(second.map((item) => item.measureId)).toEqual(first.map((item) => item.measureId));
  });

  it("écarte toute attribution existante du sous-thème cible", () => {
    const result = selectSubtopicDeltaCandidates({
      measures: [
        measure("approved", {
          text: "Lutter contre le racisme.",
          existingAssignments: [{ slug: subtopic.slug, status: "APPROVED" }],
        }),
        measure("suggested", {
          text: "Lutter contre la xénophobie.",
          existingAssignments: [{ slug: subtopic.slug, status: "SUGGESTED" }],
        }),
      ],
      subtopic,
    });

    expect(result.candidates).toEqual([]);
    expect(result.ignoredExisting).toEqual([
      expect.objectContaining({ measureId: "approved", status: "APPROVED" }),
      expect.objectContaining({ measureId: "suggested", status: "SUGGESTED" }),
    ]);
  });
});
