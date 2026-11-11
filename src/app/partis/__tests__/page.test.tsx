import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/partis", () => ({ getParties: vi.fn(), getPartiesStats: vi.fn() }));
vi.mock("@/components/partis/PartiesFilterBar", () => ({ PartiesFilterBar: () => null }));

import { getParties, getPartiesStats } from "@/lib/data/partis";
import PartiesPage from "../page";

type Counts = {
  condamnationsDefinitives: number;
  condamnationsNonDefinitives: number;
  enCours: number;
  closesSansCondamnation: number;
};

function party(affairCounts: Counts) {
  return {
    id: "party-a",
    slug: "parti-a",
    name: "Parti A",
    shortName: "PA",
    logoUrl: null,
    color: null,
    politicalPosition: null,
    politicalPositionSource: null,
    dissolvedDate: null,
    foundedDate: null,
    predecessor: null,
    _count: { politicians: 2, partyMemberships: 2 },
    affairCounts: { ...affairCounts, total: 0 },
  };
}

async function pageText(counts: Counts): Promise<string> {
  vi.mocked(getParties).mockResolvedValue([party(counts)] as never);
  const element = await PartiesPage({ searchParams: Promise.resolve({}) });
  const { container } = render(element);
  return (container.textContent ?? "").replace(/\s+/g, " ");
}

describe("carte de parti sur /partis", () => {
  beforeEach(() => {
    vi.mocked(getPartiesStats).mockResolvedValue({ actifs: 1 } as never);
  });

  // The listing compares parties at a glance, and a raw count per party reads as a ranking there.
  // The detail, with status and sources, stays on each party page.
  it("n'affiche aucun décompte judiciaire dans la liste", async () => {
    const text = await pageText({
      condamnationsDefinitives: 3,
      condamnationsNonDefinitives: 3,
      enCours: 1,
      closesSansCondamnation: 1,
    });

    expect(text).toContain("Parti A");
    expect(text).toContain("2 membres");
    expect(text).not.toMatch(/condamnation|procédure|close/i);
  });
});
