import { describe, expect, it } from "vitest";
import { assertMeasureBatchKind } from "../batch-kind";

const publicMeasure = {
  publicationStatus: "PUBLISHED",
  publishedRevisionId: "published-revision",
  publishedRevision: { text: "Texte public" },
};

const generatedContext = {
  text: "Texte public",
  details: "Contexte sourcé.",
  extractionMethod: "AI_ASSISTED" as const,
  extractorVersion: "mistral:measure-context-v9",
};

describe("assertMeasureBatchKind", () => {
  it("accepte une première publication réellement inédite", () => {
    expect(() =>
      assertMeasureBatchKind(
        "FIRST_PUBLICATION",
        { publicationStatus: "DRAFT", publishedRevisionId: null, publishedRevision: null },
        { ...generatedContext, text: "Nouvelle mesure" }
      )
    ).not.toThrow();
  });

  it("accepte seulement une correction de contexte générée sans changement de formulation", () => {
    expect(() =>
      assertMeasureBatchKind("CONTEXT_CORRECTION", publicMeasure, generatedContext)
    ).not.toThrow();
    expect(() =>
      assertMeasureBatchKind("CONTEXT_CORRECTION", publicMeasure, {
        ...generatedContext,
        text: "Texte modifié",
      })
    ).toThrow(/type de lot/i);
    expect(() =>
      assertMeasureBatchKind("CONTEXT_CORRECTION", publicMeasure, {
        ...generatedContext,
        extractorVersion: "mistral:measure-context-v8",
      })
    ).toThrow(/type de lot/i);
  });
});
