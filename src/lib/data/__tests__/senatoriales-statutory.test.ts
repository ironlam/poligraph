import { describe, expect, it } from "vitest";
import { getSenateRenewal, getSenateSeatsAtStake } from "@/config/senate-seats";

describe("propriétés statutaires des circonscriptions sénatoriales", () => {
  it("répond sans mandat courant pour un département de série 2", () => {
    expect(getSenateRenewal("13")).toBe("renewed");
    expect(getSenateSeatsAtStake("13")).toBe(8);
  });

  it("garde connue la série d'un département à un seul siège vacant", () => {
    expect(getSenateRenewal("04")).toBe("renewed");
    expect(getSenateSeatsAtStake("04")).toBe(1);
  });

  it("distingue une circonscription de série 1 d'une référence absente", () => {
    expect(getSenateRenewal("33")).toBe("renewed");
    expect(getSenateSeatsAtStake("33")).toBe(6);
    expect(getSenateRenewal("75")).toBe("not-renewed");
    expect(getSenateSeatsAtStake("75")).toBeNull();
    expect(getSenateRenewal("984")).toBe("unknown");
    expect(getSenateSeatsAtStake("984")).toBeNull();
  });
});
