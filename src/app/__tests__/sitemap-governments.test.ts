import { beforeEach, describe, expect, it, vi } from "vitest";

// Shard 0 announces the « Gouvernements » section only while its flag is on, and only the
// PUBLISHED governments, each with the latest change of the government or of its functions.

const h = vi.hoisted(() => {
  const governments = [
    {
      slug: "bayrou",
      sequence: 46,
      publicationStatus: "PUBLISHED",
      updatedAt: new Date("2026-10-01T10:00:00Z"),
      memberships: [{ updatedAt: new Date("2026-10-05T08:00:00Z") }],
    },
    {
      slug: "lecornu-2",
      sequence: 48,
      publicationStatus: "PUBLISHED",
      updatedAt: new Date("2026-10-08T10:00:00Z"),
      memberships: [{ updatedAt: new Date("2026-10-02T08:00:00Z") }],
    },
    {
      slug: "lecornu-1",
      sequence: 47,
      publicationStatus: "DRAFT",
      updatedAt: new Date("2026-10-09T10:00:00Z"),
      memberships: [],
    },
  ];
  const findMany = vi.fn(async (args: { where?: { publicationStatus?: string } }) =>
    governments
      .filter(
        (g) =>
          !args.where?.publicationStatus || g.publicationStatus === args.where.publicationStatus
      )
      .map(({ slug, updatedAt, memberships }) => ({ slug, updatedAt, memberships }))
  );
  const fallback: ProxyHandler<Record<string, unknown>> = {
    get(_t, model: string) {
      if (model === "government") return { findMany };
      if (model === "$queryRaw") return async () => [];
      return new Proxy({}, { get: () => async () => [] });
    },
  };
  return { findMany, db: new Proxy({}, fallback), isFeatureEnabled: vi.fn() };
});

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: h.isFeatureEnabled }));

import sitemap from "@/app/sitemap";
import { SITEMAP_SHARD_TAGS } from "@/lib/seo/sitemap-tags";

const shard0 = () => sitemap({ id: Promise.resolve("0") });
const govUrls = (entries: Awaited<ReturnType<typeof shard0>>) =>
  entries.filter((e) => e.url.includes("/politiques/gouvernements"));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sitemap : rubrique Gouvernements", () => {
  it("n'annonce rien quand le flag est désactivé", async () => {
    h.isFeatureEnabled.mockResolvedValue(false);
    expect(govUrls(await shard0())).toEqual([]);
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it("annonce le répertoire, les membres et les seuls gouvernements publiés", async () => {
    h.isFeatureEnabled.mockResolvedValue(true);
    const urls = govUrls(await shard0()).map((e) => e.url.replace(/^https?:\/\/[^/]+/, ""));
    expect(urls).toEqual([
      "/politiques/gouvernements",
      "/politiques/gouvernements/membres",
      "/politiques/gouvernements/bayrou",
      "/politiques/gouvernements/lecornu-2",
    ]);
    expect(urls).not.toContain("/politiques/gouvernements/lecornu-1");
    expect(h.isFeatureEnabled).toHaveBeenCalledWith("gouvernements");
  });

  it("date chaque gouvernement de son dernier changement, fonctions comprises", async () => {
    h.isFeatureEnabled.mockResolvedValue(true);
    const entries = govUrls(await shard0());
    const lastmod = (suffix: string) =>
      entries.find((e) => e.url.endsWith(suffix))?.lastModified as Date;
    // A function changed after the government row.
    expect(lastmod("/bayrou")).toEqual(new Date("2026-10-05T08:00:00Z"));
    // The government row changed last.
    expect(lastmod("/lecornu-2")).toEqual(new Date("2026-10-08T10:00:00Z"));
    // The directory follows the latest published change, not the DRAFT one.
    expect(lastmod("/politiques/gouvernements")).toEqual(new Date("2026-10-08T10:00:00Z"));
  });

  it("n'annonce ni répertoire ni membres sans gouvernement publié", async () => {
    h.isFeatureEnabled.mockResolvedValue(true);
    h.findMany.mockResolvedValueOnce([]);
    expect(govUrls(await shard0())).toEqual([]);
  });

  it("purge le shard 0 avec le tag gouvernements", () => {
    expect(SITEMAP_SHARD_TAGS[0]).toContain("gouvernements");
  });

  it("ne casse pas le shard 0 quand la lecture des gouvernements échoue", async () => {
    h.isFeatureEnabled.mockResolvedValue(true);
    h.findMany.mockRejectedValueOnce(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const entries = await shard0();
    expect(entries.length).toBeGreaterThan(0);
    expect(govUrls(entries)).toEqual([]);
    spy.mockRestore();
  });
});
