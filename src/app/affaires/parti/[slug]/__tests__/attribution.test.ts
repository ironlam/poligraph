import { describe, it, expect, vi } from "vitest";
import { ATTRIBUTION_ROWS } from "@/lib/affairs/__tests__/fixtures/attribution";

const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({ db: { party: { findUnique: () => findUnique() } } }));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));

import { generateMetadata } from "@/app/affaires/parti/[slug]/page";

describe("/affaires/parti/[slug] : compteurs à charge", () => {
  it("ne compte ni le témoin ni la condamnation non pénale parmi les élus condamnés", async () => {
    // Une ligne de fixture par élu : chaque compteur dédupliqué par élu se lit directement.
    findUnique.mockResolvedValue({
      id: "party-1",
      name: "Parti Test",
      shortName: "PT",
      slug: "parti-test",
      logoUrl: null,
      color: null,
      affairsAtTime: ATTRIBUTION_ROWS.map((row) => ({
        ...row,
        id: row.key,
        fineAmount: null,
        politician: { id: `pol-${row.key}`, fullName: row.key, slug: row.key, photoUrl: null },
      })),
    });

    const { description } = await generateMetadata({
      params: Promise.resolve({ slug: "parti-test" }),
    });

    // DIRECT pénal : enquête préliminaire, condamnation, mise en examen, relaxe.
    expect(description).toMatch(/^4 élus Parti Test concernés/);
    expect(description).toContain("1 élu condamné");
    expect(description).toContain("2 victimes");
  });
});
