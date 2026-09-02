import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HubMeasureContext } from "@/lib/data/hub";

// Mocked so importing the page pulls no @/lib/db: the data authorities are exercised in their
// own integration tests. Here we only check the metadata mapping.
vi.mock("@/lib/data/hub", () => ({
  getHubCandidacyField: vi.fn(),
  getHubMeasureContext: vi.fn(),
}));

import { getHubMeasureContext } from "@/lib/data/hub";
import { generateMetadata } from "../page";

const mockGetContext = vi.mocked(getHubMeasureContext);

function context(over: Partial<HubMeasureContext> = {}): HubMeasureContext {
  return {
    electionTitle: "Présidentielle 2027",
    round1Date: new Date("2027-04-11"),
    round2Date: new Date("2027-04-25"),
    dateConfirmed: true,
    electionDescription: null,
    publishableSubjectPageCount: 0,
    hubPublishable: false,
    verifiedMeasureCount: 0,
    lastReviewedAt: null,
    themes: [],
    featuredSubtopics: [],
    featuredReaderGuides: [],
    ...over,
  };
}

beforeEach(() => {
  mockGetContext.mockReset();
});

describe("generateMetadata du hub présidentielle", () => {
  it("titre correct", async () => {
    mockGetContext.mockResolvedValue(context({ hubPublishable: true }));
    const meta = await generateMetadata();
    expect(String(meta.title)).toMatch(/Présidentielle 2027 : programmes, mesures et candidatures/);
  });

  it("noindex quand le hub n'est pas encore publiable", async () => {
    mockGetContext.mockResolvedValue(context({ hubPublishable: false }));
    const meta = await generateMetadata();
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it("indexable une fois le hub publiable", async () => {
    mockGetContext.mockResolvedValue(context({ hubPublishable: true }));
    const meta = await generateMetadata();
    expect(meta.robots).toBeUndefined();
  });

  it("noindex quand l'élection n'existe pas", async () => {
    mockGetContext.mockResolvedValue(null);
    const meta = await generateMetadata();
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it("canonical pointe vers l'URL du hub", async () => {
    mockGetContext.mockResolvedValue(context({ hubPublishable: true }));
    const meta = await generateMetadata();
    expect(meta.alternates?.canonical).toBe("/elections/presidentielle-2027");
  });
});
