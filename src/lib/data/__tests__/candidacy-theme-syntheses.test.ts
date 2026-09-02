import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeThemeCorpusFingerprint,
  computeThemeSynthesisContentFingerprint,
} from "@/lib/presidentielle/candidacy-theme-synthesis";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  findCandidacy: vi.fn(),
  findMeasures: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    candidacy: { findFirst: h.findCandidacy },
    measure: { findMany: h.findMeasures },
  },
}));

const measures = [
  {
    id: "measure-2",
    theme: "SANTE",
    publishedRevisionId: "revision-2",
    publishedRevision: { text: "Développer les soins de proximité.", details: null },
  },
  {
    id: "measure-1",
    theme: "SANTE",
    publishedRevisionId: "revision-1",
    publishedRevision: { text: "Rouvrir des maternités.", details: null },
  },
] as const;

const claims = [
  {
    text: "Les mesures portent sur les maternités et les soins de proximité.",
    measureRefs: ["M1", "M2"],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  h.findMeasures.mockResolvedValue(measures);
});

describe("getAdminCandidacyThemeSyntheses", () => {
  it("assemble les preuves dans l'ordre canonique et calcule les deux empreintes", async () => {
    const corpusFingerprint = computeThemeCorpusFingerprint({
      theme: "SANTE",
      measures: measures.map((measure) => ({
        id: measure.id,
        revisionId: measure.publishedRevisionId,
        text: measure.publishedRevision.text,
        details: measure.publishedRevision.details,
      })),
    });
    h.findCandidacy.mockResolvedValue({
      id: "candidacy-1",
      candidateName: "Camille Démonstration",
      politician: { slug: "camille-demonstration" },
      presidentialData: {
        id: "presidential-1",
        themeSyntheses: [
          {
            id: "synthesis-1",
            theme: "SANTE",
            text: claims[0]!.text,
            evidence: { claims },
            corpusFingerprint,
            model: "mistral-large-latest",
            promptVersion: "v1",
            status: "PENDING_REVIEW",
            generatedAt: new Date("2026-09-01T12:00:00Z"),
            validatedAt: null,
          },
        ],
      },
    });
    const { getAdminCandidacyThemeSyntheses } = await import("../candidacy-theme-syntheses");

    const result = await getAdminCandidacyThemeSyntheses("camille-demonstration");

    expect(result?.themes).toHaveLength(1);
    expect(result?.themes[0]).toMatchObject({
      theme: "SANTE",
      state: "PENDING_REVIEW",
      currentCorpusFingerprint: corpusFingerprint,
      measures: [
        { id: "measure-1", ref: "M1" },
        { id: "measure-2", ref: "M2" },
      ],
      synthesis: {
        contentFingerprint: computeThemeSynthesisContentFingerprint({
          text: claims[0]!.text,
          claims,
          model: "mistral-large-latest",
          promptVersion: "v1",
        }),
      },
    });
  });

  it("marque une synthèse comme obsolète sans l'écrire", async () => {
    h.findCandidacy.mockResolvedValue({
      id: "candidacy-1",
      candidateName: "Camille Démonstration",
      politician: { slug: "camille-demonstration" },
      presidentialData: {
        id: "presidential-1",
        themeSyntheses: [
          {
            id: "synthesis-1",
            theme: "SANTE",
            text: claims[0]!.text,
            evidence: { claims },
            corpusFingerprint: "ancienne-empreinte",
            model: "mistral-large-latest",
            promptVersion: "v1",
            status: "PUBLISHED",
            generatedAt: new Date("2026-09-01T12:00:00Z"),
            validatedAt: new Date("2026-09-01T13:00:00Z"),
          },
        ],
      },
    });
    const { getAdminCandidacyThemeSyntheses } = await import("../candidacy-theme-syntheses");

    const result = await getAdminCandidacyThemeSyntheses("camille-demonstration");

    expect(result?.themes[0]?.state).toBe("OBSOLETE");
  });
});
