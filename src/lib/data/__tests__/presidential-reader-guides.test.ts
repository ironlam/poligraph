import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    measure: { findMany: mocks.findMany },
  },
}));

import { loadPresidentialReaderGuideIndex } from "../presidential-reader-guides";

const reviewedAt = new Date("2026-08-31T08:00:00Z");
const guide = {
  slug: "zones-faibles-emissions",
  label: "Zone à faibles émissions (ZFE)",
  definition:
    "Une zone à faibles émissions limite la circulation des véhicules les plus polluants dans un périmètre défini.",
  aliases: ["ZFE"],
  sourceUrl: "https://www.ecologie.gouv.fr/zfe",
  sourceLabel: "Zones à faibles émissions",
  sourcePublisher: "Ministère de la Transition écologique",
  reviewedAt,
  updatedAt: reviewedAt,
};

function measure(over: Record<string, unknown> = {}) {
  return {
    slug: "camille-exemple-supprimer-les-zfe",
    theme: "TRANSPORTS",
    publishedRevision: {
      text: "Supprimer les zones à faibles émissions.",
      reviewedAt,
      // The acronym and its expansion can both resolve to the same canonical concept.
      readerGuideMentions: [{ guide }, { guide }],
    },
    candidacy: {
      candidateName: "Camille Exemple",
      politician: { slug: "camille-exemple" },
      party: { name: "Parti exemple", shortName: "PE" },
    },
    ...over,
  };
}

beforeEach(() => {
  mocks.findMany.mockReset();
  mocks.findMany.mockResolvedValue([measure()]);
});

describe("loadPresidentialReaderGuideIndex", () => {
  it("part de l'autorité des mesures publiques et des mentions approuvées", async () => {
    await loadPresidentialReaderGuideIndex("election-1");

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          electionId: "election-1",
          publicationStatus: "PUBLISHED",
          withdrawnAt: null,
          publishedRevision: {
            is: expect.objectContaining({
              reviewedAt: { not: null },
              publishedAt: { not: null },
              readerGuideMentions: {
                some: expect.objectContaining({ status: "APPROVED" }),
              },
            }),
          },
        }),
      })
    );
  });

  it("agrège sans compter deux fois une mesure qui mentionne deux alias", async () => {
    const result = await loadPresidentialReaderGuideIndex("election-1");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      slug: "zones-faibles-emissions",
      candidateCount: 1,
      indexable: true,
      measures: [{ slug: "camille-exemple-supprimer-les-zfe" }],
      themes: [{ theme: "TRANSPORTS", measureCount: 1 }],
    });
  });

  it("n'indexe pas une définition trop courte", async () => {
    mocks.findMany.mockResolvedValue([
      measure({
        publishedRevision: {
          text: "Supprimer les zones à faibles émissions.",
          reviewedAt,
          readerGuideMentions: [{ guide: { ...guide, definition: "Définition trop courte." } }],
        },
      }),
    ]);

    const result = await loadPresidentialReaderGuideIndex("election-1");
    expect(result[0]?.indexable).toBe(false);
  });
});
