import { describe, expect, it } from "vitest";
import { selectFeaturedSubtopics } from "@/lib/presidentielle/featured-subtopics";

type MeasureInput = Parameters<typeof selectFeaturedSubtopics>[0][number];

function measure({
  id,
  candidacyId,
  theme,
  subtopic,
  withdrawn = false,
}: {
  id: string;
  candidacyId: string | null;
  theme: MeasureInput["theme"];
  subtopic: { slug: string; label: string };
  withdrawn?: boolean;
}): MeasureInput {
  return {
    id,
    candidacyId,
    theme,
    subtopics: [subtopic],
    withdrawal: withdrawn
      ? { withdrawnAt: new Date("2026-01-01"), sourceUrl: null, sourceLabel: null }
      : null,
  };
}

describe("selectFeaturedSubtopics", () => {
  it("privilégie la diversité des candidatures au volume brut de mesures", () => {
    const measures = [
      ...Array.from({ length: 5 }, (_, index) =>
        measure({
          id: `volume-${index}`,
          candidacyId: "candidature-a",
          theme: "ECONOMIE_BUDGET",
          subtopic: { slug: "fiscalite", label: "Fiscalité" },
        })
      ),
      measure({
        id: "diversite-a",
        candidacyId: "candidature-a",
        theme: "SANTE",
        subtopic: { slug: "acces-aux-soins", label: "Accès aux soins" },
      }),
      measure({
        id: "diversite-b",
        candidacyId: "candidature-b",
        theme: "SANTE",
        subtopic: { slug: "acces-aux-soins", label: "Accès aux soins" },
      }),
    ];

    expect(selectFeaturedSubtopics(measures).map((subtopic) => subtopic.slug)).toEqual([
      "acces-aux-soins",
      "fiscalite",
    ]);
  });

  it("limite chaque grande thématique à deux entrées et ignore les retraits", () => {
    const measures = [
      measure({
        id: "eco-1",
        candidacyId: "a",
        theme: "ECONOMIE_BUDGET",
        subtopic: { slug: "fiscalite", label: "Fiscalité" },
      }),
      measure({
        id: "eco-2",
        candidacyId: "b",
        theme: "ECONOMIE_BUDGET",
        subtopic: { slug: "industrie", label: "Entreprises et industrie" },
      }),
      measure({
        id: "eco-3",
        candidacyId: "c",
        theme: "ECONOMIE_BUDGET",
        subtopic: { slug: "budget", label: "Budget de l'État" },
      }),
      measure({
        id: "sante-retiree",
        candidacyId: "d",
        theme: "SANTE",
        subtopic: { slug: "hopital", label: "Hôpital" },
        withdrawn: true,
      }),
    ];

    const selected = selectFeaturedSubtopics(measures);

    expect(selected.filter((subtopic) => subtopic.theme === "ECONOMIE_BUDGET")).toHaveLength(2);
    expect(selected.map((subtopic) => subtopic.slug)).not.toContain("hopital");
  });
});
