import { describe, it, expect } from "vitest";
import { budgetPartNumbers } from "@/services/sync/link-scrutins-to-amendments/parse-title";

describe("budgetPartNumbers", () => {
  it("maps a bare title number to both finance-bill parts", () => {
    expect(budgetPartNumbers("1358")).toEqual(["I-1358", "II-1358"]);
  });

  it("leaves already-prefixed and committee numbers alone", () => {
    expect(budgetPartNumbers("I-1358")).toEqual([]);
    expect(budgetPartNumbers("II-CF711")).toEqual([]);
    expect(budgetPartNumbers("CF12")).toEqual([]);
  });
});
