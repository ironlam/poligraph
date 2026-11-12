import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { parliamentaryGroupPresidency: { findMany: mocks.findMany } },
}));

import { getGroupPresidents } from "@/lib/data/groupes";
import { PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const person = (slug: string, civility: string | null = "Mme") => ({
  slug,
  firstName: "Alix",
  lastName: "Exemple",
  fullName: "Alix Exemple",
  civility,
  photoUrl: null,
  blobPhotoUrl: null,
});

const row = (politicianId: string, start: string, end: string | null) => ({
  politicianId,
  startDate: day(start),
  endDate: end ? day(end) : null,
  sourceUrl: "https://data.senat.fr/data/senateurs/ODSEN_HISTOGROUPES.csv",
  politician: person(politicianId),
});

describe("getGroupPresidents", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(day("2026-11-12"));
    mocks.findMany.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("returns the sitting president, dated from the start of the uninterrupted presidency", async () => {
    mocks.findMany.mockResolvedValue([
      row("a", "2026-10-05", null),
      row("a", "2023-10-03", "2026-09-30"),
      row("b", "2018-01-23", "2023-10-01"),
    ]);
    await expect(getGroupPresidents("g1")).resolves.toEqual([
      {
        politician: person("a"),
        since: day("2023-10-03"),
        sourceUrl: "https://data.senat.fr/data/senateurs/ODSEN_HISTOGROUPES.csv",
      },
    ]);
  });

  it("returns nothing when no presidency is known, or when all have ended", async () => {
    mocks.findMany.mockResolvedValue([]);
    await expect(getGroupPresidents("g1")).resolves.toEqual([]);
    mocks.findMany.mockResolvedValue([row("a", "2018-01-23", "2023-10-01")]);
    await expect(getGroupPresidents("g1")).resolves.toEqual([]);
  });

  it("reads the asked group only, and only people with a public profile", async () => {
    mocks.findMany.mockResolvedValue([]);
    await getGroupPresidents("g1");
    const { where } = mocks.findMany.mock.calls[0]![0];
    expect(where).toEqual({ parliamentaryGroupId: "g1", politician: PUBLIC_POLITICIAN_WHERE });
  });
});
