import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked so importing the page pulls no @/lib/db: the data authority is exercised in its own
// integration test. Here we only check the metadata mapping and the theme-param parsing.
vi.mock("@/lib/data/subject-page", () => ({ getSubjectPageData: vi.fn() }));

import { getSubjectPageData } from "@/lib/data/subject-page";
import { generateMetadata } from "../page";

const mockGet = vi.mocked(getSubjectPageData);

function props(theme: string) {
  return { params: Promise.resolve({ theme }) };
}

beforeEach(() => {
  mockGet.mockReset();
});

describe("generateMetadata de la page thème", () => {
  it("noindex et titre explicite pour un thème inconnu, sans lire les données", async () => {
    const meta = await generateMetadata(props("pas-un-theme"));
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(String(meta.title)).toMatch(/introuvable/i);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("indexable une fois le seuil de page thème franchi", async () => {
    mockGet.mockResolvedValue({ publishable: true } as never);
    const meta = await generateMetadata(props("logement-urbanisme"));
    expect(meta.robots).toBeUndefined();
    expect(String(meta.title)).toMatch(/Présidentielle 2027/);
  });

  it("noindex tant que le seuil n'est pas franchi", async () => {
    mockGet.mockResolvedValue({ publishable: false } as never);
    const meta = await generateMetadata(props("logement-urbanisme"));
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it("noindex quand l'élection n'existe pas", async () => {
    mockGet.mockResolvedValue(null);
    const meta = await generateMetadata(props("sante"));
    expect(meta.robots).toEqual({ index: false, follow: true });
  });
});
