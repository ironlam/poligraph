import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirst = vi.fn();
const getFactCheckContext = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { factCheck: { findFirst: () => findFirst() } } }));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/data/factcheck-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/factcheck-context")>()),
  getFactCheckContext: (...args: unknown[]) => getFactCheckContext(...args),
}));

import { generateMetadata } from "@/app/factchecks/[slug]/page";
import { EMPTY_FACTCHECK_CONTEXT } from "@/lib/data/factcheck-context";

const metadataFor = (slug: string) => generateMetadata({ params: Promise.resolve({ slug }) });

const FACTCHECK = {
  slug: "factcheck-reel",
  title: "Un fact-check publié",
  claimant: "Jean Dupont",
  claimText: "Une affirmation à vérifier.",
  claimDate: new Date("2026-10-09T08:00:00.000Z"),
  verdictRating: "FALSE",
  mentions: [{ isClaimant: true, politician: { slug: "jean-dupont" } }],
};

beforeEach(() => {
  findFirst.mockReset();
  getFactCheckContext.mockReset();
});

describe("/factchecks/[slug] metadata", () => {
  it("noindex un fact-check inexistant au lieu de l'offrir à l'indexation", async () => {
    findFirst.mockResolvedValue(null);

    const m = await metadataFor("x-bidon");

    expect(m.title).toBe("Fact-check non trouvé");
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("garde dans l'index un fact-check dont le contexte est jugé indexable", async () => {
    findFirst.mockResolvedValue(FACTCHECK);
    getFactCheckContext.mockResolvedValue({ ...EMPTY_FACTCHECK_CONTEXT, indexable: true });

    const m = await metadataFor("factcheck-reel");

    expect(getFactCheckContext).toHaveBeenCalledWith({
      factCheckSlug: "factcheck-reel",
      authorSlug: "jean-dupont",
      claimDay: "2026-10-09",
      theme: null,
    });
    expect(m.title).toBe("Un fact-check publié");
    expect(m.description).toContain("Jean Dupont");
    expect(m.alternates?.canonical).toBe("/factchecks/factcheck-reel");
    expect(m.robots).toBeUndefined();
  });

  it("ne transmet au contexte qu'un thème validé dans l'admin", async () => {
    getFactCheckContext.mockResolvedValue(EMPTY_FACTCHECK_CONTEXT);
    findFirst.mockResolvedValue({ ...FACTCHECK, theme: "SANTE", themeReviewedAt: null });
    await metadataFor("factcheck-reel");
    expect(getFactCheckContext).toHaveBeenLastCalledWith(expect.objectContaining({ theme: null }));

    findFirst.mockResolvedValue({ ...FACTCHECK, theme: "SANTE", themeReviewedAt: new Date() });
    await metadataFor("factcheck-reel");
    expect(getFactCheckContext).toHaveBeenLastCalledWith(
      expect.objectContaining({ theme: "SANTE" })
    );
  });

  it("sort de l'index, sans bloquer les liens, un fact-check sans contexte suffisant", async () => {
    findFirst.mockResolvedValue({ ...FACTCHECK, mentions: [] });
    getFactCheckContext.mockResolvedValue(EMPTY_FACTCHECK_CONTEXT);

    const m = await metadataFor("factcheck-reel");

    expect(getFactCheckContext).toHaveBeenCalledWith(expect.objectContaining({ authorSlug: null }));
    expect(m.alternates?.canonical).toBe("/factchecks/factcheck-reel");
    expect(m.robots).toEqual({ index: false, follow: true });
  });
});
