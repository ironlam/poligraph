import { describe, expect, it } from "vitest";
import {
  createCandidacyPresidentialFromPickerSchema,
  reviewCandidateSynthesisSchema,
} from "../candidate";

const declare = {
  politicianId: "p1",
  electionSlug: "presidentielle-2027",
  status: "DECLARE" as const,
};

/**
 * A DECLARE candidacy must be sourced (#660). Other statuses stay usable for editorial tracking without
 * a source. Written violation-first: the rejection of an unsourced DECLARE is the point.
 */
describe("createCandidacyPresidentialFromPickerSchema : source exigée pour DECLARE", () => {
  it("refuse une candidature DECLARE sans source", () => {
    expect(createCandidacyPresidentialFromPickerSchema.safeParse(declare).success).toBe(false);
  });

  it("refuse une DECLARE avec URL mais sans libellé", () => {
    expect(
      createCandidacyPresidentialFromPickerSchema.safeParse({
        ...declare,
        sourceUrl: "https://example.org/annonce",
      }).success
    ).toBe(false);
  });

  it("accepte une candidature DECLARE sourcée", () => {
    expect(
      createCandidacyPresidentialFromPickerSchema.safeParse({
        ...declare,
        sourceUrl: "https://example.org/annonce",
        sourceLabel: "Discours du 1er mars",
      }).success
    ).toBe(true);
  });

  it("accepte une candidature PRESSENTI sans source", () => {
    expect(
      createCandidacyPresidentialFromPickerSchema.safeParse({
        politicianId: "p1",
        electionSlug: "presidentielle-2027",
        status: "PRESSENTI",
      }).success
    ).toBe(true);
  });

  it("refuse une sourceUrl qui n'est pas une URL", () => {
    expect(
      createCandidacyPresidentialFromPickerSchema.safeParse({
        ...declare,
        sourceUrl: "pas-une-url",
        sourceLabel: "Libellé",
      }).success
    ).toBe(false);
  });
});

const declareSourced = {
  ...declare,
  sourceUrl: "https://example.org/annonce",
  sourceLabel: "Discours du 1er mars",
};

/**
 * declaredAt is optional for a DECLARE candidacy (correction 2026-08-06): a sourced declaration stays valid
 * even when the exact announcement date is unknown. The schema must never inject a date on its own, and the
 * date, when given, is neither a substitute for the source nor silently dropped.
 */
describe("createCandidacyPresidentialFromPickerSchema : declaredAt facultatif (correction 2026-08-06)", () => {
  it("accepte une DECLARE sourcée sans declaredAt et n'invente aucune date", () => {
    const result = createCandidacyPresidentialFromPickerSchema.safeParse(declareSourced);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.declaredAt).toBeUndefined();
    }
  });

  it("conserve declaredAt quand il est fourni au format ISO", () => {
    const result = createCandidacyPresidentialFromPickerSchema.safeParse({
      ...declareSourced,
      declaredAt: "2026-03-01T10:00:00.000Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.declaredAt).toBe("2026-03-01T10:00:00.000Z");
    }
  });

  it("refuse une DECLARE avec declaredAt mais sans source : la date ne remplace pas la source", () => {
    expect(
      createCandidacyPresidentialFromPickerSchema.safeParse({
        ...declare,
        declaredAt: "2026-03-01T10:00:00.000Z",
      }).success
    ).toBe(false);
  });
});

describe("reviewCandidateSynthesisSchema", () => {
  it("accepte un texte relu et refuse une valeur trop courte ou un champ imprévu", () => {
    expect(
      reviewCandidateSynthesisSchema.safeParse({
        synthesis: "Une synthèse éditoriale relue et suffisamment développée.",
      }).success
    ).toBe(true);
    expect(reviewCandidateSynthesisSchema.safeParse({ synthesis: "Trop court." }).success).toBe(
      false
    );
    expect(
      reviewCandidateSynthesisSchema.safeParse({
        synthesis: "Une synthèse éditoriale relue et suffisamment développée.",
        publicationStatus: "PUBLISHED",
      }).success
    ).toBe(false);
  });
});
