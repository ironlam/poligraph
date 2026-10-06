import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Prisma } from "@/generated/prisma";

/**
 * Badge probité de /politiques : il se fonde sur la catégorie de l'infraction, pas sur la
 * gravité. Une condamnation définitive pour incitation à la haine (CRITIQUE) ne le déclenche
 * pas, une condamnation définitive pour corruption (GRAVE) le déclenche. Le nombre affiché
 * sur l'option de filtre vient du même prédicat que les fiches filtrées.
 */

const mocks = vi.hoisted(() => ({
  politicianFindMany: vi.fn(),
  politicianCount: vi.fn(),
  partyFindMany: vi.fn(),
  partyFindFirst: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/politiques",
}));
vi.mock("@/lib/db", () => ({
  db: {
    politician: { findMany: mocks.politicianFindMany, count: mocks.politicianCount },
    party: { findMany: mocks.partyFindMany, findFirst: mocks.partyFindFirst },
    $queryRaw: mocks.queryRaw,
  },
}));

import PolitiquesPage from "../page";
import { PoliticiansGrid } from "@/components/politicians/PoliticiansGrid";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getParty } from "@/lib/data/partis";
import * as labels from "@/config/labels";
import {
  getProbityConvictionBadgeSql,
  getProbityConvictionBadgeWhere,
} from "@/lib/affairs/public-filters";
import { CONVICTION_ROWS } from "@/lib/affairs/__tests__/fixtures/conviction-rows";
import { evaluateWhere } from "@/lib/affairs/__tests__/fixtures/evaluate-where";

type Params = Record<string, string>;
const renderPage = (searchParams: Params) =>
  (PolitiquesPage as (p: { searchParams: Promise<Params> }) => Promise<unknown>)({
    searchParams: Promise.resolve(searchParams),
  });

const kept = (where: object) =>
  Object.entries(CONVICTION_ROWS)
    .filter(([, r]) => evaluateWhere(r, where as Record<string, unknown>))
    .map(([key]) => key)
    .sort();

beforeEach(() => {
  vi.clearAllMocks();
  mocks.politicianFindMany.mockResolvedValue([]);
  mocks.politicianCount.mockResolvedValue(0);
  mocks.partyFindMany.mockResolvedValue([]);
  mocks.partyFindFirst.mockResolvedValue(null);
  mocks.queryRaw.mockResolvedValue([
    {
      with_conviction: BigInt(0),
      total_affairs: BigInt(0),
      deputes: BigInt(0),
      senateurs: BigInt(0),
      gouvernement: BigInt(0),
      dirigeants: BigInt(0),
      maires: BigInt(0),
    },
  ]);
});

describe("/politiques : badge probité fondé sur la catégorie", () => {
  it("l'include du listing (badge et compte) ne retient que la corruption définitive", async () => {
    await renderPage({});
    const { include } = mocks.politicianFindMany.mock.calls[0]![0];

    expect(kept(include.affairs.where)).toEqual(["definitiveCorruptionGrave"]);
    expect(kept(include._count.select.affairs.where)).toEqual(["definitiveCorruptionGrave"]);
    expect(include.affairs.where).toEqual(getProbityConvictionBadgeWhere());
  });

  it("le filtre « condamnés » ne retient que la corruption définitive", async () => {
    await renderPage({ conviction: "true" });
    const { where } = mocks.politicianFindMany.mock.calls[0]![0];
    const relation = where.AND.find((c: Record<string, unknown>) => "affairs" in c);

    expect(relation.affairs.some).toEqual(getProbityConvictionBadgeWhere());
    expect(kept(relation.affairs.some)).toEqual(["definitiveCorruptionGrave"]);
  });

  it("les compteurs SQL utilisent le prédicat partagé, sans gravité, pour le filtre et le total", async () => {
    await renderPage({});
    const [strings, ...values] = mocks.queryRaw.mock.calls[0]!;
    const text = (strings as readonly string[]).join("${}");

    expect(text).not.toMatch(/severity/i);
    const expected = getProbityConvictionBadgeSql("a");
    const fragments = values.filter(
      (v): v is Prisma.Sql => typeof v === "object" && v !== null && "sql" in v && "values" in v
    );
    expect(fragments).toHaveLength(2);
    for (const fragment of fragments) {
      expect(fragment.sql).toBe(expected.sql);
      expect(fragment.values).toEqual(expected.values);
    }
  });
});

describe("PoliticiansGrid : libellé du filtre probité", () => {
  it("affiche « Condamnés pour probité » avec son infobulle", () => {
    render(
      <TooltipProvider>
        <PoliticiansGrid
          politicians={[]}
          total={0}
          page={1}
          totalPages={1}
          parties={[]}
          counts={{
            withConviction: 3,
            deputes: 0,
            senateurs: 0,
            gouvernement: 0,
            dirigeants: 0,
            maires: 0,
          }}
          filters={{
            search: "",
            partyFilter: "",
            convictionFilter: false,
            mandateFilter: "" as never,
            sortOption: "prominence",
          }}
        />
      </TooltipProvider>
    );

    const badge = screen.getByText("Condamnés pour probité (3)");
    expect(badge).toHaveAttribute("title", "Condamnation définitive pour atteinte à la probité");
    expect(screen.queryByText(/Avec décision de justice/)).toBeNull();
  });
});

describe("/partis/[slug] : compte des élus condamnés pour probité", () => {
  it("_count.affairs utilise le prédicat du badge probité", async () => {
    await getParty("parti-test");
    const args = mocks.partyFindFirst.mock.calls[0]![0];
    const where = args.include.politicians.include._count.select.affairs.where;

    expect(where).toEqual(getProbityConvictionBadgeWhere());
    expect(kept(where)).toEqual(["definitiveCorruptionGrave"]);
  });
});

describe("labels.ts", () => {
  it("n'exporte plus CONVICTION_BADGE_WHERE", () => {
    expect("CONVICTION_BADGE_WHERE" in labels).toBe(false);
  });
});
