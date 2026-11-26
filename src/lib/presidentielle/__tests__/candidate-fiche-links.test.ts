import { describe, expect, it } from "vitest";
import type { PresidentialReaderGuideIndexItem } from "@/lib/data/presidential-reader-guides";
import type { ThemesIndexData } from "@/lib/data/themes-index";
import {
  selectCandidateFactChecks,
  selectCandidateReaderGuides,
  selectComparableThemes,
} from "@/lib/presidentielle/candidate-fiche-links";

function guide(
  slug: string,
  indexable: boolean,
  candidateSlugs: string[]
): PresidentialReaderGuideIndexItem {
  return {
    slug,
    label: slug,
    indexable,
    measures: candidateSlugs.map((candidateSlug) => ({ candidateSlug })),
  } as unknown as PresidentialReaderGuideIndexItem;
}

describe("liens de la fiche candidat", () => {
  it("ne relie que les pages thème indexables", () => {
    const index = {
      themes: [
        { theme: "SANTE", publishable: true },
        { theme: "SOCIAL_TRAVAIL", publishable: false },
      ],
    } as unknown as ThemesIndexData;

    const themes = selectComparableThemes(index);

    expect(themes.has("SANTE")).toBe(true);
    expect(themes.has("SOCIAL_TRAVAIL")).toBe(false);
    expect(selectComparableThemes(null).size).toBe(0);
  });

  it("ne relie que les repères indexables mentionnés par une mesure du candidat", () => {
    const guides = [
      guide("parquet", true, ["edouard-philippe", "francois-ruffin"]),
      guide("kafala-judiciaire", false, ["edouard-philippe"]),
      guide("pantouflage", true, ["francois-ruffin"]),
    ];

    expect(selectCandidateReaderGuides(guides, "edouard-philippe")).toEqual([
      { slug: "parquet", label: "parquet" },
    ]);
  });
});

describe("selectCandidateFactChecks", () => {
  const paths = { landing: "/factchecks/politique/x", filtered: "/factchecks?politician=x" };
  const item = (n: number) => ({
    slug: `fc-${n}`,
    title: `T${n}`,
    claimText: "",
    verdictRating: "FALSE" as const,
    source: "AFP",
    publishedAt: new Date(Date.UTC(2026, 0, n)),
  });
  const landing = (claimed: number, indexable: boolean) =>
    ({
      author: { id: "p", slug: "x", fullName: "X" },
      hasCandidacy: true,
      claimed: Array.from({ length: claimed }, (_, i) => item(i + 1)),
      cited: [item(50)],
      breakdown: { vrai: 0, trompeur: 0, faux: claimed, inverifiable: 0 },
      bySource: [
        { name: "AFP", total: claimed, vrai: 0, trompeur: 0, faux: claimed, inverifiable: 0 },
      ],
      firstYear: 2026,
      indexable,
    }) as unknown as Parameters<typeof selectCandidateFactChecks>[0];

  it("ne rend rien sans landing ni sous une déclaration vérifiée, citations comprises", () => {
    expect(selectCandidateFactChecks(null, paths)).toBeNull();
    expect(selectCandidateFactChecks(landing(0, false), paths)).toBeNull();
  });

  it("garde les 3 premières et suit la règle d'indexation de la landing", () => {
    const one = selectCandidateFactChecks(landing(1, false), paths)!;
    expect(one).toMatchObject({ total: 1, sourceCount: 1, href: paths.filtered });
    const many = selectCandidateFactChecks(landing(5, true), paths)!;
    expect(many.recent.map((r) => r.slug)).toEqual(["fc-1", "fc-2", "fc-3"]);
    expect(many.href).toBe(paths.landing);
  });
});
