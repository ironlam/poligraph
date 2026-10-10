import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Metadata } from "next";

// Spec §8: the six rows of the « Gouvernements » indexation matrix, checked on the pages' own
// generateMetadata. Canonical is always the bare page itself.

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: vi.fn(async () => true) }));
vi.mock("@/lib/data/governments", () => ({
  getPublishedGovernments: vi.fn(),
  getGovernmentEpisodes: vi.fn(),
}));

import { getPublishedGovernments } from "@/lib/data/governments";
import type { PublishedGovernment } from "@/lib/governments/mapping";
import { generateMetadata as directoryMetadata } from "@/app/politiques/gouvernements/page";
import { generateMetadata as detailMetadata } from "@/app/politiques/gouvernements/[slug]/page";
import { generateMetadata as membersMetadata } from "@/app/politiques/gouvernements/membres/page";

type SP = Record<string, string | string[] | undefined>;

const NOINDEX_FOLLOW = { index: false, follow: true };

function isNoindex(m: Metadata): boolean {
  return (m.robots as { index?: boolean } | undefined)?.index === false;
}

const directory = (sp: SP) => directoryMetadata({ searchParams: Promise.resolve(sp) });
const detail = (sp: SP) =>
  detailMetadata({
    params: Promise.resolve({ slug: "lecornu-2" }),
    searchParams: Promise.resolve(sp),
  });
const members = (sp: SP) => membersMetadata({ searchParams: Promise.resolve(sp) });

beforeEach(() => {
  vi.mocked(getPublishedGovernments).mockResolvedValue([
    { slug: "lecornu-2", name: "Gouvernement Sébastien Lecornu II" } as PublishedGovernment,
  ]);
});

describe("/politiques/gouvernements", () => {
  it("sans paramètre : indexable, canonical vers elle-même", async () => {
    const m = await directory({});
    expect(m.robots).toBeUndefined();
    expect(m.alternates?.canonical).toBe("/politiques/gouvernements");
  });

  it.each([{ q: "lecornu" }, { annee: "2025" }])("avec %o : noindex, follow", async (sp) => {
    const m = await directory(sp);
    expect(m.robots).toEqual(NOINDEX_FOLLOW);
    expect(m.alternates?.canonical).toBe("/politiques/gouvernements");
  });

  it("un paramètre vide ne compte pas comme filtre", async () => {
    expect(isNoindex(await directory({ q: "" }))).toBe(false);
  });
});

describe("/politiques/gouvernements/[slug]", () => {
  it("publié, sans paramètre : indexable, canonical vers elle-même", async () => {
    const m = await detail({});
    expect(m.robots).toBeUndefined();
    expect(m.alternates?.canonical).toBe("/politiques/gouvernements/lecornu-2");
    expect(m.title).toBe("Gouvernement Sébastien Lecornu II : composition et ministres");
  });

  it.each(["2025-10-12", "pas-une-date"])("avec date=%s : noindex, follow", async (date) => {
    const m = await detail({ date });
    expect(m.robots).toEqual(NOINDEX_FOLLOW);
    // A historical composition is not a duplicate of the latest one: no canonical to it.
    expect(m.alternates?.canonical).toBe("/politiques/gouvernements/lecornu-2");
  });
});

describe("/politiques/gouvernements/membres", () => {
  it("sans paramètre : indexable, canonical vers elle-même", async () => {
    const m = await members({});
    expect(m.robots).toBeUndefined();
    expect(m.alternates?.canonical).toBe("/politiques/gouvernements/membres");
  });

  it.each([
    { mode: "present" },
    { du: "2017-05-15" },
    { au: "2025-01-01" },
    { gouvernement: "lecornu-2" },
    { fonction: "ministre" },
    { q: "dupont" },
    { page: "2" },
  ])("avec %o : noindex, follow", async (sp) => {
    const m = await members(sp);
    expect(m.robots).toEqual(NOINDEX_FOLLOW);
    expect(m.alternates?.canonical).toBe("/politiques/gouvernements/membres");
  });
});
