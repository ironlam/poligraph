import { beforeEach, describe, expect, it, vi } from "vitest";
import { ATTRIBUTION_ROWS } from "@/lib/affairs/__tests__/fixtures/attribution";
import { evaluateWhere } from "@/lib/affairs/__tests__/fixtures/evaluate-where";

const mocks = vi.hoisted(() => ({ affairCount: vi.fn() }));

vi.mock("@/lib/db", () => ({ db: { affair: { count: mocks.affairCount } } }));
vi.mock("next/og", () => ({ ImageResponse: vi.fn() }));
vi.mock("@/lib/og-utils", () => ({
  OgLayout: () => null,
  OgCategoryLabel: () => null,
  OG_SIZE: { width: 1200, height: 630 },
}));

import Image from "./opengraph-image";

describe("image OG /affaires/condamnations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.affairCount.mockResolvedValue(0);
  });

  it("ne compte que la condamnation pénale de la personne mise en cause, jamais un témoin", async () => {
    await Image();

    const [definitive, nonDefinitive] = mocks.affairCount.mock.calls.map(
      (call) => (call[0] as { where: Record<string, unknown> }).where
    );
    const matched = (where: Record<string, unknown>) =>
      ATTRIBUTION_ROWS.filter((row) => evaluateWhere(row, where)).map((row) => row.key);
    expect(matched(definitive!)).toEqual(["directPenalConvicted"]);
    expect(matched({ ...nonDefinitive!, status: "CONDAMNATION_DEFINITIVE" })).toEqual([
      "directPenalConvicted",
    ]);
  });
});
