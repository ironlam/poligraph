import { beforeEach, describe, expect, it, vi } from "vitest";
import { MEASURE_SUBTOPICS } from "@/config/measure-subtopics";

const mocks = vi.hoisted(() => ({
  callMistral: vi.fn(),
  extractMistralText: vi.fn(),
  parseMistralJSON: vi.fn(),
}));

vi.mock("@/lib/api/mistral", () => mocks);

const subtopic = MEASURE_SUBTOPICS.find((item) => item.slug === "racisme-antisemitisme")!;
const measure = {
  measureId: "measure-1",
  revisionId: "revision-1",
  sourceUpdatedAt: "2026-08-30T00:00:00.000Z",
  candidateName: "Candidate Exemple",
  theme: "SOCIETE_DROITS_LIBERTES" as const,
  text: 'Renforcer la lutte contre le "racisme".\nSans inventer de faits.',
  details: null,
  existingAssignments: [],
  selectionReasons: [{ signal: "LEXICAL" as const, values: ["racisme"] }],
  control: false,
};

describe("décision différentielle structurée", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callMistral.mockResolvedValue({ model: "mistral-small-2506", choices: [] });
    mocks.extractMistralText.mockReturnValue("{}");
    mocks.parseMistralJSON.mockReturnValue({
      decision: "APPLIES",
      confidence: 0.98,
      justification: "La mesure vise explicitement le racisme.",
      evidenceExcerpt: "Renforcer la lutte contre le racisme",
    });
  });

  it("sanitise le contenu et renvoie une décision bornée", async () => {
    const { classifyMeasureForSubtopicDelta } =
      await import("@/services/measures/subtopic-delta-classifier");
    const result = await classifyMeasureForSubtopicDelta({ measure, subtopic });

    expect(result).toMatchObject({
      decision: "APPLIES",
      confidence: 0.98,
      classifierVersion: "mistral-small-2506:subtopic-delta-v1",
    });
    const messages = mocks.callMistral.mock.calls[0]?.[0] as Array<{ content: string }>;
    expect(messages[0]?.content).toContain("Renforcer la lutte contre le racisme");
    expect(messages[0]?.content).not.toContain('"racisme"');
  });

  it("refuse un extrait absent de la mesure", async () => {
    mocks.parseMistralJSON.mockReturnValue({
      decision: "UNCERTAIN",
      confidence: 0.5,
      justification: "Le texte ne permet pas de trancher clairement.",
      evidenceExcerpt: "Un passage inventé par le modèle",
    });
    const { classifyMeasureForSubtopicDelta } =
      await import("@/services/measures/subtopic-delta-classifier");

    await expect(classifyMeasureForSubtopicDelta({ measure, subtopic })).rejects.toThrow(
      "ne provient pas"
    );
  });

  it("conserve le passage lexical même lorsqu’il se trouve loin dans le texte", async () => {
    const distantEvidence = "Combattre les discriminations raciales dans les services publics";
    mocks.parseMistralJSON.mockReturnValue({
      decision: "APPLIES",
      confidence: 0.95,
      justification: "Les discriminations raciales sont explicitement visées.",
      evidenceExcerpt: distantEvidence,
    });
    const { classifyMeasureForSubtopicDelta } =
      await import("@/services/measures/subtopic-delta-classifier");
    await classifyMeasureForSubtopicDelta({
      subtopic,
      measure: {
        ...measure,
        text: `${"Préambule sans rapport. ".repeat(80)} ${distantEvidence}.`,
        selectionReasons: [{ signal: "LEXICAL", values: ["discriminations raciales"] }],
      },
    });

    const messages = mocks.callMistral.mock.calls[0]?.[0] as Array<{ content: string }>;
    expect(messages[0]?.content).toContain(distantEvidence);
  });
});
