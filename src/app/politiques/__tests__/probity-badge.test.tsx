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
  cacheTag: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheTag: mocks.cacheTag, cacheLife: vi.fn() }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: async () => false }));
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
  getPoliticalFinancingBadgeSql,
  getPoliticalFinancingBadgeWhere,
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

    expect(kept(include._count.select.affairs.where)).toEqual(["definitiveCorruptionGrave"]);
    expect(include._count.select.affairs.where).toEqual(getProbityConvictionBadgeWhere());
  });

  it("le badge financement politique ne retient que le financement illégal définitif", async () => {
    await renderPage({});
    const { include } = mocks.politicianFindMany.mock.calls[0]![0];

    expect(include.affairs.where).toEqual(getPoliticalFinancingBadgeWhere());
    expect(kept(include.affairs.where)).toEqual(["definitiveCampaignFinancing"]);
  });

  it("dérive chaque badge de sa propre relation", async () => {
    mocks.politicianFindMany.mockResolvedValue([
      {
        id: "p1",
        _count: { affairs: 0 },
        affairs: [{ id: "a1" }],
        mandates: [],
        declarations: [],
        partyHistory: [],
      },
    ]);
    mocks.politicianCount.mockResolvedValue(1);
    const tree = await renderPage({});
    const json = JSON.stringify(tree, (_k, v) => (typeof v === "bigint" ? Number(v) : v));

    expect(json).toContain('"hasCritiqueAffair":false');
    expect(json).toContain('"hasPoliticalFinancingConviction":true');
  });

  const convictionOr = async (params: Params) => {
    await renderPage(params);
    const { where } = mocks.politicianFindMany.mock.calls[0]![0];
    return where.AND.find((c: Record<string, unknown>) => "OR" in c)?.OR as
      | { affairs: { some: object } }[]
      | undefined;
  };

  it("le filtre « condamnés » ne retient que la corruption définitive", async () => {
    const or = await convictionOr({ conviction: "true" });

    expect(or).toHaveLength(1);
    expect(or![0]!.affairs.some).toEqual(getProbityConvictionBadgeWhere());
    expect(kept(or![0]!.affairs.some)).toEqual(["definitiveCorruptionGrave"]);
  });

  it("le filtre financement ne retient que le financement illégal définitif", async () => {
    const or = await convictionOr({ financing: "true" });

    expect(or).toHaveLength(1);
    expect(or![0]!.affairs.some).toEqual(getPoliticalFinancingBadgeWhere());
    expect(kept(or![0]!.affairs.some)).toEqual(["definitiveCampaignFinancing"]);
  });

  it("les deux filtres cochés se combinent en « l'un ou l'autre »", async () => {
    const or = await convictionOr({ conviction: "true", financing: "true" });

    expect(or!.map((c) => c.affairs.some)).toEqual([
      getProbityConvictionBadgeWhere(),
      getPoliticalFinancingBadgeWhere(),
    ]);
  });

  it("sans filtre de condamnation, aucune condition OR", async () => {
    expect(await convictionOr({})).toBeUndefined();
  });

  it("le compteur SQL du filtre utilise le prédicat partagé, sans gravité", async () => {
    await renderPage({});
    const [strings, ...values] = mocks.queryRaw.mock.calls[0]!;
    const text = (strings as readonly string[]).join("${}");

    expect(text).not.toMatch(/severity/i);
    const fragments = values.filter(
      (v): v is Prisma.Sql => typeof v === "object" && v !== null && "sql" in v && "values" in v
    );
    expect(text).not.toContain("total_affairs");
    expect(fragments.map((f) => [f.sql, f.values])).toEqual(
      [getProbityConvictionBadgeSql("a"), getPoliticalFinancingBadgeSql("a")].map((f) => [
        f.sql,
        f.values,
      ])
    );
  });
});

describe("/politiques : invalidation sur modification d'affaire", () => {
  it("le listing et les compteurs portent le tag affairs", async () => {
    await renderPage({});
    const tagCalls = mocks.cacheTag.mock.calls.filter((c) => c.includes("politicians"));

    // Listing filtré puis compteurs de filtres.
    expect(tagCalls.filter((c) => c.includes("affairs")).length).toBeGreaterThanOrEqual(2);
  });
});

describe("PoliticiansGrid : filtres de condamnation", () => {
  it("affiche une seule case par filtre, avec son compte", () => {
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
            withFinancing: 2,
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
            financingFilter: false,
            mandateFilter: "" as never,
            sortOption: "prominence",
          }}
        />
      </TooltipProvider>
    );

    expect(screen.getAllByText(/Condamnés pour atteinte à la probité/)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /probité/ })).toBeNull();
    expect(screen.getByLabelText("Condamnés pour atteinte à la probité (3)")).toHaveAttribute(
      "type",
      "checkbox"
    );
    expect(
      screen.getByLabelText("Condamnés pour financement politique illégal (2)")
    ).toHaveAttribute("type", "checkbox");
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

  it("la relation affairs des membres porte le badge financement politique", async () => {
    await getParty("parti-test");
    const args = mocks.partyFindFirst.mock.calls[0]![0];
    const where = args.include.politicians.include.affairs.where;

    expect(where).toEqual(getPoliticalFinancingBadgeWhere());
    expect(kept(where)).toEqual(["definitiveCampaignFinancing"]);
  });
});

describe("labels.ts", () => {
  it("n'exporte plus CONVICTION_BADGE_WHERE", () => {
    expect("CONVICTION_BADGE_WHERE" in labels).toBe(false);
  });
});
