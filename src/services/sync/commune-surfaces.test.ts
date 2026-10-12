import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
import { planSurfaces } from "./commune-surfaces";

const stored = new Map<string, number | null>([
  ["35238", null],
  ["75056", 10540.8],
  ["97601", 1000],
]);

describe("planSurfaces", () => {
  it("écrit une surface absente ou différente, pas une surface identique", () => {
    const plan = planSurfaces(
      [
        { code: "35238", surface: 5033.19 },
        { code: "75056", surface: 10540.8 },
        { code: "97601", surface: 1254.11 },
      ],
      stored
    );
    expect(plan.toWrite).toEqual([
      { code: "35238", hectares: 5033.19 },
      { code: "97601", hectares: 1254.11 },
    ]);
    expect(plan.unchanged).toBe(1);
  });

  it("écarte une surface manquante, nulle, négative ou invraisemblable", () => {
    const plan = planSurfaces(
      [
        { code: "35238" },
        { code: "75056", surface: 0 },
        { code: "97601", surface: -3 },
        { code: "99999", surface: 1e9 },
      ],
      stored
    );
    expect(plan.toWrite).toEqual([]);
    expect(plan.rejected).toBe(4);
  });

  it("ne crée pas de commune et compte celles que la source ne couvre pas", () => {
    const plan = planSurfaces(
      [
        { code: "35238", surface: 5033.19 },
        { code: "00000", surface: 12 },
      ],
      stored
    );
    expect(plan.unknownCodes).toEqual(["00000"]);
    expect(plan.missingFromSource).toBe(2);
  });
});
