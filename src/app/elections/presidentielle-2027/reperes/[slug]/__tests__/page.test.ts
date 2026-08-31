import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/presidential-reader-guides", () => ({
  getPresidentialReaderGuide: vi.fn(),
}));

import { getPresidentialReaderGuide } from "@/lib/data/presidential-reader-guides";
import { generateMetadata } from "../page";

const mockGet = vi.mocked(getPresidentialReaderGuide);

function props(slug = "zones-faibles-emissions") {
  return { params: Promise.resolve({ slug }) };
}

beforeEach(() => {
  mockGet.mockReset();
});

describe("métadonnées d'un repère présidentiel", () => {
  it("rend un repère substantiel indexable avec un canonical stable", async () => {
    mockGet.mockResolvedValue({
      slug: "zones-faibles-emissions",
      label: "Zone à faibles émissions (ZFE)",
      definition:
        "Une zone à faibles émissions limite la circulation des véhicules les plus polluants dans un périmètre défini.",
      indexable: true,
    } as never);

    const metadata = await generateMetadata(props());
    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates?.canonical).toBe(
      "/elections/presidentielle-2027/reperes/zones-faibles-emissions"
    );
    expect(String(metadata.title)).toContain("Zone à faibles émissions");
  });

  it("garde un repère mince hors index", async () => {
    mockGet.mockResolvedValue({
      slug: "terme-court",
      label: "Terme court",
      definition: "Définition courte.",
      indexable: false,
    } as never);

    const metadata = await generateMetadata(props("terme-court"));
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it("garde une URL inconnue hors index", async () => {
    mockGet.mockResolvedValue(null);
    const metadata = await generateMetadata(props("inconnu"));
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
});
