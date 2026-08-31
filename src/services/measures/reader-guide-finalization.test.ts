import { describe, expect, it, vi } from "vitest";
import {
  applyReaderGuideFinalization,
  hashReaderGuideFinalizationPlan,
  isReaderGuideFinalizationRetryCompatible,
  planReaderGuideFinalization,
} from "./reader-guide-finalization";

vi.mock("@/lib/db", () => ({ db: {} }));
const serviceMocks = vi.hoisted(() => ({
  publish: vi.fn(),
  review: vi.fn(),
}));
vi.mock("@/lib/measures/reader-guides", () => ({
  publishReaderGuide: serviceMocks.publish,
  reviewReaderGuideMention: serviceMocks.review,
}));

const publishedGuide = {
  id: "guide-zfe",
  slug: "zones-faibles-emissions",
  label: "Zone à faibles émissions (ZFE)",
  aliases: ["ZFE", "zones à faibles émissions"],
  definition: "Une définition institutionnelle suffisamment complète pour être publiée.",
  publicationStatus: "PUBLISHED" as const,
  sourceKind: "OFFICIAL_INSTITUTION" as const,
  sourceUrl: "https://www.ecologie.gouv.fr/politiques-publiques/zones-faibles-emissions-zfe",
  sourceLabel: "Zones à faibles émissions",
  sourcePublisher: "Ministère de la Transition écologique",
  sourceRevisionId: null,
  sourceRevision: null,
};

function mention(input: {
  id: string;
  term: string;
  normalizedTerm: string;
  guideId?: string | null;
  approvedGuideIds?: string[];
}) {
  return {
    id: input.id,
    guideId: input.guideId ?? null,
    term: input.term,
    normalizedTerm: input.normalizedTerm,
    confidence: 0.94,
    revision: {
      id: `revision-${input.id}`,
      readerGuideMentions: (input.approvedGuideIds ?? []).map((guideId) => ({ guideId })),
      publishedOf: { id: `measure-${input.id}`, electionId: "election-1" },
    },
  };
}

describe("finalisation en lot des repères", () => {
  it("résout un terme par alias sans créer un nouveau repère", () => {
    const plan = planReaderGuideFinalization({
      electionSlug: "presidentielle-2027",
      guides: [publishedGuide],
      mentions: [mention({ id: "1", term: "ZFE", normalizedTerm: "zfe", guideId: null })],
    });

    expect(plan.ready).toBe(1);
    expect(plan.items[0]).toMatchObject({
      outcome: "READY",
      guideId: "guide-zfe",
      publishesGuide: false,
    });
  });

  it("publie un brouillon complet une seule fois avant ses rattachements", () => {
    const draftGuide = { ...publishedGuide, publicationStatus: "DRAFT" as const };
    const plan = planReaderGuideFinalization({
      electionSlug: "presidentielle-2027",
      guides: [draftGuide],
      mentions: [
        mention({ id: "1", term: "ZFE", normalizedTerm: "zfe" }),
        mention({ id: "2", term: "ZFE", normalizedTerm: "zfe" }),
      ],
    });

    expect(plan.ready).toBe(2);
    expect(plan.guidesToPublish).toEqual([
      expect.objectContaining({
        id: "guide-zfe",
        slug: "zones-faibles-emissions",
        label: publishedGuide.label,
        definition: publishedGuide.definition,
        sourceUrl: publishedGuide.sourceUrl,
      }),
    ]);
  });

  it("invalide l'empreinte si la définition ou sa source change après relecture", () => {
    const mentions = [mention({ id: "1", term: "ZFE", normalizedTerm: "zfe" })];
    const first = planReaderGuideFinalization({
      electionSlug: "presidentielle-2027",
      guides: [{ ...publishedGuide, publicationStatus: "DRAFT" }],
      mentions,
    });
    const changed = planReaderGuideFinalization({
      electionSlug: "presidentielle-2027",
      guides: [
        {
          ...publishedGuide,
          publicationStatus: "DRAFT",
          definition: `${publishedGuide.definition} Texte modifié après le dry-run.`,
        },
      ],
      mentions,
    });

    expect(hashReaderGuideFinalizationPlan(changed)).not.toBe(
      hashReaderGuideFinalizationPlan(first)
    );
  });

  it("autorise la reprise du même rapport sans accepter de nouveau rattachement", () => {
    const reviewed = planReaderGuideFinalization({
      electionSlug: "presidentielle-2027",
      guides: [{ ...publishedGuide, publicationStatus: "DRAFT" }],
      mentions: [
        mention({ id: "1", term: "ZFE", normalizedTerm: "zfe" }),
        mention({ id: "2", term: "ZFE", normalizedTerm: "zfe" }),
      ],
    });
    const remaining = planReaderGuideFinalization({
      electionSlug: "presidentielle-2027",
      guides: [publishedGuide],
      mentions: [mention({ id: "2", term: "ZFE", normalizedTerm: "zfe" })],
    });
    const withNewMention = planReaderGuideFinalization({
      electionSlug: "presidentielle-2027",
      guides: [publishedGuide],
      mentions: [
        mention({ id: "2", term: "ZFE", normalizedTerm: "zfe" }),
        mention({ id: "3", term: "ZFE", normalizedTerm: "zfe" }),
      ],
    });
    const withChangedDefinition = planReaderGuideFinalization({
      electionSlug: "presidentielle-2027",
      guides: [{ ...publishedGuide, definition: "Une définition modifiée après la relecture." }],
      mentions: [mention({ id: "2", term: "ZFE", normalizedTerm: "zfe" })],
    });

    expect(isReaderGuideFinalizationRetryCompatible(reviewed, remaining)).toBe(false);
    expect(isReaderGuideFinalizationRetryCompatible(reviewed, remaining, new Set(["1"]))).toBe(
      true
    );
    expect(isReaderGuideFinalizationRetryCompatible(reviewed, withNewMention)).toBe(false);
    expect(isReaderGuideFinalizationRetryCompatible(reviewed, withChangedDefinition)).toBe(false);
  });

  it("laisse les termes inconnus et les brouillons incomplets hors du lot", () => {
    const invalidGuide = {
      ...publishedGuide,
      id: "guide-invalid",
      label: "Kafala judiciaire",
      aliases: ["kafala"],
      publicationStatus: "DRAFT" as const,
      definition: "",
    };
    const plan = planReaderGuideFinalization({
      electionSlug: "presidentielle-2027",
      guides: [invalidGuide],
      mentions: [
        mention({ id: "1", term: "Kafala", normalizedTerm: "kafala" }),
        mention({ id: "2", term: "Terme inconnu", normalizedTerm: "terme inconnu" }),
      ],
    });

    expect(plan.invalidGuides).toBe(1);
    expect(plan.unresolved).toBe(1);
    expect(plan.unresolvedTerms).toEqual([
      { normalizedTerm: "terme inconnu", example: "Terme inconnu", occurrences: 1 },
    ]);
    expect(plan.ready).toBe(0);
  });

  it("n'approuve pas deux fois le même repère sur une révision", () => {
    const duplicate = mention({
      id: "1",
      term: "ZFE",
      normalizedTerm: "zfe",
      approvedGuideIds: ["guide-zfe"],
    });
    const plan = planReaderGuideFinalization({
      electionSlug: "presidentielle-2027",
      guides: [publishedGuide],
      mentions: [duplicate],
    });

    expect(plan.duplicates).toBe(1);
    expect(plan.ready).toBe(0);
  });

  it("publie puis approuve chaque rattachement prêt avec le même acteur audité", async () => {
    serviceMocks.publish.mockResolvedValue(undefined);
    serviceMocks.review.mockResolvedValue(undefined);
    const plan = planReaderGuideFinalization({
      electionSlug: "presidentielle-2027",
      guides: [{ ...publishedGuide, publicationStatus: "DRAFT" }],
      mentions: [mention({ id: "1", term: "ZFE", normalizedTerm: "zfe" })],
    });

    const result = await applyReaderGuideFinalization(plan, "cli:reader-guides:run-1");

    expect(result).toEqual({ publishedGuides: 1, approvedMentions: 1, errors: [] });
    expect(serviceMocks.publish).toHaveBeenCalledWith(
      "guide-zfe",
      "cli:reader-guides:run-1",
      {},
      expect.objectContaining({
        definition: publishedGuide.definition,
        sourceUrl: publishedGuide.sourceUrl,
      })
    );
    expect(serviceMocks.review).toHaveBeenCalledWith({
      mentionId: "1",
      guideId: "guide-zfe",
      status: "APPROVED",
      reviewedBy: "cli:reader-guides:run-1",
    });
  });

  it("sérialise les validations qui synchronisent la même mesure", async () => {
    let active = 0;
    let maxActive = 0;
    serviceMocks.review.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
    });
    const secondGuide = {
      ...publishedGuide,
      id: "guide-kafala",
      slug: "kafala-judiciaire",
      label: "Kafala judiciaire",
      aliases: ["kafala"],
    };
    const first = mention({ id: "1", term: "ZFE", normalizedTerm: "zfe" });
    const second = mention({
      id: "2",
      term: "Kafala",
      normalizedTerm: "kafala",
      guideId: "guide-kafala",
    });
    second.revision.id = first.revision.id;
    second.revision.publishedOf = first.revision.publishedOf;
    const plan = planReaderGuideFinalization({
      electionSlug: "presidentielle-2027",
      guides: [publishedGuide, secondGuide],
      mentions: [first, second],
    });

    const result = await applyReaderGuideFinalization(plan, "cli:reader-guides:run-2");

    expect(result.approvedMentions).toBe(2);
    expect(maxActive).toBe(1);
  });
});
