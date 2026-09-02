import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const count = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    election: { findUnique: () => findUnique() },
    candidacy: { count: () => count(), findMany: vi.fn(async () => []) },
  },
}));

import { generateMetadata } from "@/app/elections/[slug]/page";

const metadataFor = (slug: string) => generateMetadata({ params: Promise.resolve({ slug }) });

beforeEach(() => {
  findUnique.mockReset();
  count.mockReset();
  count.mockResolvedValue(0);
});

describe("/elections/[slug] metadata", () => {
  it("noindex une élection inexistante au lieu de l'offrir à l'indexation", async () => {
    findUnique.mockResolvedValue(null);

    const m = await metadataFor("x-bidon");

    expect(m.title).toBe("Élection non trouvée");
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("laisse intacte la metadata d'une élection existante", async () => {
    findUnique.mockResolvedValue({
      id: "e1",
      slug: "municipales-2026",
      title: "Municipales 2026",
      description: "Description officielle.",
      type: "MUNICIPALES",
      scope: "LOCAL",
      status: "SCHEDULED",
      rounds: [],
    });

    const m = await metadataFor("municipales-2026");

    expect(m.title).toBe("Municipales 2026 | Poligraph");
    expect(m.description).toBe("Description officielle.");
    expect(m.alternates?.canonical).toBe("/elections/municipales-2026");
    expect(m.robots).toBeUndefined();
  });
});
