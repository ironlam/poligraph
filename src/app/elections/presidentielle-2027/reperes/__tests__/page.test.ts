import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/presidential-reader-guides", () => ({
  getPresidentialReaderGuideIndex: vi.fn(),
}));

import { getPresidentialReaderGuideIndex } from "@/lib/data/presidential-reader-guides";
import { generateMetadata } from "../page";

const mockGet = vi.mocked(getPresidentialReaderGuideIndex);

beforeEach(() => {
  mockGet.mockReset();
});

describe("métadonnées du glossaire présidentiel", () => {
  it("reste noindex tant qu'aucun repère ne porte une page substantielle", async () => {
    mockGet.mockResolvedValue([]);
    const metadata = await generateMetadata();
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it("devient indexable avec un repère indexable et garde son URL canonique", async () => {
    mockGet.mockResolvedValue([{ indexable: true }] as never);
    const metadata = await generateMetadata();
    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates?.canonical).toBe("/elections/presidentielle-2027/reperes");
  });
});
