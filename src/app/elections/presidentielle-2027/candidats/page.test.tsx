import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/hub", () => ({ getHubCandidacyField: vi.fn() }));

import { getHubCandidacyField } from "@/lib/data/hub";
import { generateMetadata } from "./page";

const mockGetCandidacies = vi.mocked(getHubCandidacyField);

beforeEach(() => {
  mockGetCandidacies.mockReset();
  mockGetCandidacies.mockResolvedValue([
    {
      id: "c1",
      candidateName: "Alix Dupont",
      politicianSlug: "alix-dupont",
      photoUrl: null,
      blobPhotoUrl: null,
      status: "DECLARE",
      sourceUrl: "https://example.org/source",
      sourceLabel: "Le Monde",
      partyLabel: "Parti Test",
      partyColor: null,
      partyShortName: null,
      partyLogoUrl: null,
      measureCount: 1,
      themesCoveredCount: 1,
      programmeAbsence: null,
    },
  ]);
});

describe("metadata de l'annuaire présidentiel", () => {
  it("indexe la liste nue avec son canonical", async () => {
    const metadata = await generateMetadata({ searchParams: Promise.resolve({}) });

    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates?.canonical).toBe("/elections/presidentielle-2027/candidats");
    expect(String(metadata.title)).toContain("Présidentielle 2027");
  });

  it("passe les variantes filtrées en noindex,follow", async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ statut: "annoncees" }),
    });

    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBe("/elections/presidentielle-2027/candidats");
  });

  it("n'indexe pas un annuaire vide", async () => {
    mockGetCandidacies.mockResolvedValue([]);
    const metadata = await generateMetadata({ searchParams: Promise.resolve({}) });

    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
});
