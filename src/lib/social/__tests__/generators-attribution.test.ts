import { beforeEach, describe, expect, it, vi } from "vitest";
import { ATTRIBUTION_ROWS } from "@/lib/affairs/__tests__/fixtures/attribution";
import { evaluateWhere } from "@/lib/affairs/__tests__/fixtures/evaluate-where";

const mocks = vi.hoisted(() => ({
  affairGroupBy: vi.fn(),
  politicianFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    affair: { groupBy: mocks.affairGroupBy },
    politician: { findMany: mocks.politicianFindMany },
  },
}));

import { GENERATORS } from "../generators";

type Where = Record<string, unknown>;

const rows = ATTRIBUTION_ROWS.map((row) => ({ ...row, politicianId: "p1" }));
const recent = { entityIds: new Set<string>() };

describe("générateurs sociaux : attribution directe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.affairGroupBy.mockImplementation(async ({ where }: { where: Where }) => {
      const count = rows.filter((row) => evaluateWhere(row, where)).length;
      return count > 0 ? [{ politicianId: "p1", _count: count }] : [];
    });
  });

  it("le post des condamnations par parti ne compte que les condamnations directes d'ordre pénal", async () => {
    mocks.politicianFindMany.mockResolvedValue([{ id: "p1", currentParty: { shortName: "PX" } }]);

    const [draft] = await GENERATORS.chiffres!(recent);

    expect(draft!.content).toContain("1 condamnation d'élus par parti");
    expect(draft!.content).toContain("• PX : 1/1 élu");
  });

  it("le post « affaires judiciaires documentées » ne compte que les affaires à charge", async () => {
    mocks.politicianFindMany.mockImplementation(
      async (args: { include: { _count: { select: { affairs: { where: Where } } } } }) => [
        {
          slug: "elu-test",
          fullName: "Élu Test",
          currentParty: { shortName: "PX" },
          mandates: [],
          _count: {
            affairs: rows.filter((row) =>
              evaluateWhere(row, args.include._count.select.affairs.where)
            ).length,
          },
        },
      ]
    );

    const [draft] = await GENERATORS.profil!(recent);

    expect(draft!.content).toContain("2 affaires judiciaires documentées.");
  });
});
