import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked so importing the page pulls no @/lib/db: the data authority is exercised in its own
// integration test. Here we only check the metadata mapping.
vi.mock("@/lib/data/themes-index", () => ({ getThemesIndex: vi.fn() }));

import { getThemesIndex } from "@/lib/data/themes-index";
import { generateMetadata } from "../page";

const mockGet = vi.mocked(getThemesIndex);

beforeEach(() => {
  mockGet.mockReset();
});

describe("generateMetadata de l'index des thématiques", () => {
  it("titre correct", async () => {
    mockGet.mockResolvedValue({
      electionSlug: "presidentielle-2027",
      themes: [],
      featuredSubtopics: [],
      publishableSubjectPageCount: 1,
    });
    const meta = await generateMetadata();
    expect(String(meta.title)).toBe("Programmes par thème, présidentielle 2027");
  });

  it("noindex quand aucune page thème n'est publiable", async () => {
    mockGet.mockResolvedValue({
      electionSlug: "presidentielle-2027",
      themes: [],
      featuredSubtopics: [],
      publishableSubjectPageCount: 0,
    });
    const meta = await generateMetadata();
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it("indexable une fois au moins une page thème publiable", async () => {
    mockGet.mockResolvedValue({
      electionSlug: "presidentielle-2027",
      themes: [],
      featuredSubtopics: [],
      publishableSubjectPageCount: 1,
    });
    const meta = await generateMetadata();
    expect(meta.robots).toBeUndefined();
  });

  it("noindex quand l'élection n'existe pas", async () => {
    mockGet.mockResolvedValue(null);
    const meta = await generateMetadata();
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it("porte un canonical propre, distinct du hub", async () => {
    mockGet.mockResolvedValue({
      electionSlug: "presidentielle-2027",
      themes: [],
      featuredSubtopics: [],
      publishableSubjectPageCount: 1,
    });
    const meta = await generateMetadata();
    expect(meta.alternates?.canonical).toBe("/elections/presidentielle-2027/themes");
  });
});
