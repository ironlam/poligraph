import { describe, expect, it } from "vitest";
import { createCandidacyPresidentialFromPickerSchema } from "../candidate";

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
