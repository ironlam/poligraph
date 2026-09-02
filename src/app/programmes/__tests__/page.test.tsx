import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HubMeasureContext } from "@/lib/data/hub";

vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: vi.fn() }));
vi.mock("@/lib/data/platforms", () => ({ getLatestPlatformsPerParty: vi.fn() }));
vi.mock("@/lib/data/hub", () => ({
  getHubMeasureContext: vi.fn(),
  getHubCandidacyField: vi.fn(),
}));

import { isFeatureEnabled } from "@/lib/feature-flags";
import { getLatestPlatformsPerParty } from "@/lib/data/platforms";
import { getHubCandidacyField, getHubMeasureContext } from "@/lib/data/hub";
import ProgrammesPage, { metadata } from "../page";

const context: HubMeasureContext = {
  electionTitle: "Présidentielle 2027",
  round1Date: new Date("2027-04-11"),
  round2Date: new Date("2027-04-25"),
  dateConfirmed: true,
  electionDescription: null,
  publishableSubjectPageCount: 12,
  hubPublishable: true,
  verifiedMeasureCount: 845,
  lastReviewedAt: new Date("2026-08-30"),
  themes: [],
  featuredSubtopics: [],
  featuredReaderGuides: [],
};

beforeEach(() => {
  vi.mocked(isFeatureEnabled).mockResolvedValue(true);
  vi.mocked(getLatestPlatformsPerParty).mockResolvedValue([]);
  vi.mocked(getHubMeasureContext).mockResolvedValue(context);
  vi.mocked(getHubCandidacyField).mockResolvedValue([
    {
      id: "candidature-1",
      candidateName: "Camille Exemple",
      politicianSlug: "camille-exemple",
      photoUrl: null,
      blobPhotoUrl: null,
      status: "DECLARE",
      sourceUrl: "https://example.com/source",
      sourceLabel: "Source officielle",
      partyLabel: null,
      partyColor: null,
      partyShortName: null,
      partyLogoUrl: null,
      measureCount: 14,
      themesCoveredCount: 6,
      programmeAbsence: null,
    },
    {
      id: "candidature-2",
      candidateName: "Alex Exemple",
      politicianSlug: "alex-exemple",
      photoUrl: null,
      blobPhotoUrl: null,
      status: "PRESSENTI",
      sourceUrl: "https://example.com/source-2",
      sourceLabel: "Source officielle",
      partyLabel: null,
      partyColor: null,
      partyShortName: null,
      partyLogoUrl: null,
      measureCount: 2,
      themesCoveredCount: 1,
      programmeAbsence: null,
    },
  ]);
});

describe("page programmes", () => {
  it("centre les métadonnées sur les programmes et la présidentielle 2027", () => {
    expect(metadata.title).toBe("Programmes politiques 2027 et programmes des partis");
    expect(metadata.description).toContain("présidentielle 2027");
    expect(metadata.alternates?.canonical).toBe("/programmes");
  });

  it("compte neutralement les personnalités documentées quel que soit leur statut", async () => {
    render(await ProgrammesPage());

    expect(
      screen.getByRole("heading", { name: "Comparer les programmes des candidats" })
    ).toBeInTheDocument();
    expect(screen.getByText("845")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Personnalités documentées")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Explorer la présidentielle 2027/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027"
    );
  });

  it("ne promet pas de comparaison avant le seuil de publication du hub", async () => {
    vi.mocked(getHubMeasureContext).mockResolvedValue({
      ...context,
      hubPublishable: false,
      publishableSubjectPageCount: 0,
    });

    render(await ProgrammesPage());

    expect(
      screen.queryByRole("heading", { name: "Comparer les programmes des candidats" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Explorer la présidentielle 2027/ })
    ).not.toBeInTheDocument();
  });
});
