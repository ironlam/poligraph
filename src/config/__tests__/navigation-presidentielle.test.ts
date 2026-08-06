import { describe, it, expect } from "vitest";
import { NAV_SECONDARY } from "@/config/navigation";

describe("nav hub présidentielle", () => {
  it("points at the hub", () => {
    const e = NAV_SECONDARY.find((i) => i.href === "/elections/presidentielle-2027");
    expect(e).toBeDefined();
    expect(e?.label).toBe("Présidentielle 2027");
  });
});
