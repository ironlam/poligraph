import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { extractPenaltyData } from "./discover-affairs";
import type { WikidataClaim } from "@/lib/api/wikidata";

describe("extractPenaltyData", () => {
  it("extracts prison sentence from P1596 + P2047 qualifiers", () => {
    const claim: WikidataClaim = {
      mainsnak: {
        datavalue: { value: { id: "Q852973" }, type: "wikibase-entityid" },
      },
      qualifiers: {
        P1596: [{ datavalue: { value: { id: "Q853735" } } }],
        P2047: [
          {
            datavalue: {
              value: { amount: "+2", unit: "http://www.wikidata.org/entity/Q577" },
            },
          },
        ],
      },
    };
    const result = extractPenaltyData(claim);
    expect(result.prisonMonths).toBe(24);
    // « emprisonnement » says nothing about a sursis, so the split stays unestablished.
    expect(result.prisonFirmMonths).toBeNull();
  });

  it("extracts sursis from P1596 qualifier", () => {
    const claim: WikidataClaim = {
      mainsnak: {
        datavalue: { value: { id: "Q852973" }, type: "wikibase-entityid" },
      },
      qualifiers: {
        P1596: [{ datavalue: { value: { id: "Q4737759" } } }],
        P2047: [
          {
            datavalue: {
              value: { amount: "+18", unit: "http://www.wikidata.org/entity/Q5151" },
            },
          },
        ],
      },
    };
    const result = extractPenaltyData(claim);
    expect(result.prisonMonths).toBe(18);
    expect(result.prisonFirmMonths).toBe(0);
  });

  it("extracts verdict date from P585 qualifier", () => {
    const claim: WikidataClaim = {
      mainsnak: {
        datavalue: { value: { id: "Q852973" }, type: "wikibase-entityid" },
      },
      qualifiers: {
        P585: [
          {
            datavalue: {
              value: { time: "+2022-02-18T00:00:00Z", precision: 11 },
            },
          },
        ],
      },
    };
    const result = extractPenaltyData(claim);
    expect(result.verdictDate).toEqual(new Date("2022-02-18"));
  });

  it.each([
    ["une année", "+2024-00-00T00:00:00Z", 9],
    ["un mois", "+2024-05-00T00:00:00Z", 10],
    ["un jour impossible", "+2024-02-30T00:00:00Z", 11],
  ])("n’invente pas de date exacte à partir de %s", (_label, time, precision) => {
    const claim: WikidataClaim = {
      mainsnak: {
        datavalue: { value: { id: "Q852973" }, type: "wikibase-entityid" },
      },
      qualifiers: {
        P585: [{ datavalue: { value: { time, precision } } }],
      },
    };

    expect(extractPenaltyData(claim).verdictDate).toBeUndefined();
  });

  it("extracts court from P4884 qualifier", () => {
    const claim: WikidataClaim = {
      mainsnak: {
        datavalue: { value: { id: "Q852973" }, type: "wikibase-entityid" },
      },
      qualifiers: {
        P4884: [{ datavalue: { value: { id: "Q3027684" } } }],
      },
    };
    const result = extractPenaltyData(claim);
    expect(result.courtQid).toBe("Q3027684");
  });

  it("extracts multiple penalties (prison + fine)", () => {
    const claim: WikidataClaim = {
      mainsnak: {
        datavalue: { value: { id: "Q852973" }, type: "wikibase-entityid" },
      },
      qualifiers: {
        P1596: [
          { datavalue: { value: { id: "Q853735" } } },
          { datavalue: { value: { id: "Q1243001" } } },
        ],
      },
    };
    const result = extractPenaltyData(claim);
    expect(result.prisonMonths).toBeUndefined();
    expect(result.prisonFirmMonths).toBeNull();
    expect(result.hasFine).toBe(true);
  });

  it("returns empty object for claim without qualifiers", () => {
    const claim: WikidataClaim = {
      mainsnak: {
        datavalue: { value: { id: "Q852973" }, type: "wikibase-entityid" },
      },
    };
    const result = extractPenaltyData(claim);
    expect(result).toEqual({});
  });

  it("handles perpetuity (fixed 9999 months)", () => {
    const claim: WikidataClaim = {
      mainsnak: {
        datavalue: { value: { id: "Q852973" }, type: "wikibase-entityid" },
      },
      qualifiers: {
        P1596: [{ datavalue: { value: { id: "Q68676" } } }],
      },
    };
    const result = extractPenaltyData(claim);
    expect(result.prisonMonths).toBe(9999);
    // French law does not suspend a life term, so no firm part is asserted either.
    expect(result.prisonFirmMonths).toBeNull();
  });

  /**
   * The case the fix exists for (#576): a sursis Q-ID with no usable P2047 duration.
   * `durationMonths` stays undefined, so writing a firm part of 0 would assert a
   * suspended term of no length, which no invariant allows.
   */
  it("n'écrit pas de part ferme sur un sursis sans durée", () => {
    const claim: WikidataClaim = {
      mainsnak: {
        datavalue: { value: { id: "Q852973" }, type: "wikibase-entityid" },
      },
      qualifiers: {
        P1596: [{ datavalue: { value: { id: "Q4737759" } } }],
      },
    };
    const result = extractPenaltyData(claim);
    expect(result.prisonMonths).toBeUndefined();
    expect(result.prisonFirmMonths).toBeNull();
  });

  it("n'écrit pas de part ferme sur un sursis probatoire sans durée", () => {
    const claim: WikidataClaim = {
      mainsnak: {
        datavalue: { value: { id: "Q852973" }, type: "wikibase-entityid" },
      },
      qualifiers: {
        P1596: [{ datavalue: { value: { id: "Q17355222" } } }],
      },
    };
    const result = extractPenaltyData(claim);
    expect(result.prisonFirmMonths).toBeNull();
  });
});
