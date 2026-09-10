import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `Party.slug` is nullable, and a party is public as soon as one of its politicians is published,
 * with no condition on the slug. A slugless row therefore reaches generateStaticParams, which
 * hands Next `{ slug: null }` and fails the whole build with "a required parameter (slug) was not
 * provided as a string received object", typeof null being "object".
 *
 * Measured on production data 2026-09-10: one such row, created two days earlier, broke
 * `next build` at page collection while CI stayed green, since CI builds without the database.
 * The sitemap and /affaires/parti/[slug] already filter on the slug; this route did not.
 */

const findMany = vi.fn();
vi.mock("@/lib/db", () => ({ db: { party: { findMany: (args: unknown) => findMany(args) } } }));
vi.mock("@/lib/data/partis", () => ({
  getParty: vi.fn(),
  getPartyLeadership: vi.fn(async () => []),
  getPartyRoles: vi.fn(async () => []),
}));
vi.mock("@/lib/data/platforms", () => ({ getPartyPlatform: vi.fn(async () => null) }));

import { generateStaticParams } from "@/app/partis/[slug]/page";

beforeEach(() => findMany.mockReset());

describe("/partis/[slug] generateStaticParams", () => {
  it("écarte un parti sans slug au lieu de casser la collecte des pages", async () => {
    findMany.mockResolvedValue([
      { slug: "renaissance" },
      { slug: null },
      { slug: "parti-socialiste" },
    ]);
    await expect(generateStaticParams()).resolves.toEqual([
      { slug: "renaissance" },
      { slug: "parti-socialiste" },
    ]);
  });

  it("n'émet que des chaînes non vides", async () => {
    findMany.mockResolvedValue([{ slug: null }, { slug: "" }, { slug: "horizons" }]);
    const params = await generateStaticParams();
    for (const p of params) expect(typeof p.slug).toBe("string");
    expect(params).toEqual([{ slug: "horizons" }]);
  });

  it("garde les partis avec slug quand aucun n'est nul", async () => {
    // Guards the assertions above: a filter that dropped everything would pass them too.
    findMany.mockResolvedValue([{ slug: "les-ecologistes" }]);
    await expect(generateStaticParams()).resolves.toEqual([{ slug: "les-ecologistes" }]);
  });
});
