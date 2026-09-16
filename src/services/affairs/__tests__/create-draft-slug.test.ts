import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `generateUniqueSlug` only resolves collisions: its contract says the base is
 * "already slugified". The discovery pass did not honour that and passed
 * `"Aeschlimann-Condamnation de Manuel Aeschlimann pour favoritisme dans des
 * marchés publics"` verbatim, so five drafts carried a slug with spaces,
 * capitals and accents.
 *
 * The guarantee belongs to the door rather than to each importer: it is the one
 * place every affair creation goes through, and slugifying an already-slugified
 * base is a no-op.
 */

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    affair: { create: mocks.create, findUnique: mocks.findUnique },
  },
}));

import { createDraftAffairFromDiscovery } from "../create-draft";

/** Slug written on the single create() call the door makes. */
function writtenSlug(): string {
  const call = mocks.create.mock.calls[0];
  if (!call) throw new Error("db.affair.create was never called");
  return (call[0] as { data: { slug: string } }).data.slug;
}

const INPUT = {
  politicianId: "pol-1",
  title: "Condamnation de Manuel Aeschlimann pour favoritisme",
  description: "…",
  status: "CONDAMNATION_DEFINITIVE" as const,
  category: "FAVORITISME" as const,
  sources: [],
};

describe("createDraftAffairFromDiscovery — slug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: "aff-1", slug: "x" });
  });

  it("slugifies a base that was passed raw", async () => {
    await createDraftAffairFromDiscovery({
      ...INPUT,
      baseSlug: "Aeschlimann-Condamnation de Manuel Aeschlimann pour favoritisme",
    });

    const slug = writtenSlug();
    expect(slug).toBe("aeschlimann-condamnation-de-manuel-aeschlimann-pour-favoritisme");
  });

  it("leaves an already slugified base untouched", async () => {
    await createDraftAffairFromDiscovery({
      ...INPUT,
      baseSlug: "manuel-aeschlimann-favoritisme-marche-public",
    });

    const slug = writtenSlug();
    expect(slug).toBe("manuel-aeschlimann-favoritisme-marche-public");
  });

  it("strips accents and punctuation", async () => {
    await createDraftAffairFromDiscovery({
      ...INPUT,
      baseSlug: "Letchimy-Concussion lors de sa réintégration (Fort-de-France)",
    });

    const slug = writtenSlug();
    expect(slug).toBe("letchimy-concussion-lors-de-sa-reintegration-fort-de-france");
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it("still resolves collisions on the slugified base", async () => {
    mocks.findUnique.mockResolvedValueOnce({ id: "other" }).mockResolvedValue(null);

    await createDraftAffairFromDiscovery({
      ...INPUT,
      baseSlug: "Doucet-Charges de mission",
    });

    const slug = writtenSlug();
    expect(slug).toBe("doucet-charges-de-mission-2");
  });
});
