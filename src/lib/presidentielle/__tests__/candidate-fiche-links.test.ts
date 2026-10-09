import { describe, expect, it } from "vitest";
import type { PresidentialReaderGuideIndexItem } from "@/lib/data/presidential-reader-guides";
import type { ThemesIndexData } from "@/lib/data/themes-index";
import {
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
