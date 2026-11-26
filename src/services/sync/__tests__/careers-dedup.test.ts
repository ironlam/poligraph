import { describe, it, expect } from "vitest";
import { MandateType, DataSource } from "@/generated/prisma";
import { isDuplicateMandateCandidate } from "../careers-dedup";

describe("isDuplicateMandateCandidate", () => {
  it("skips an active parliamentary candidate when an active same-type mandate already exists, even from a non-authoritative source with a distant start date", () => {
    // Regression: a politician already has one active SENATEUR mandate (e.g. an
    // official one whose source was not yet set, or a prior Wikidata import). A
    // second active SENATEUR with a start date >30 days apart must NOT be created
    // — it would breach the one-active-mandate-per-type invariant and inflate the
    // vote-by-theme aggregates.
    const existing = [
      {
        type: MandateType.SENATEUR,
        source: null,
        startDate: "2020-01-01",
        isCurrent: true,
      },
    ];
    const candidate = {
      type: MandateType.SENATEUR,
      startDate: new Date("2020-10-01"),
      isCurrent: true,
    };
    expect(isDuplicateMandateCandidate(existing, candidate)).toBe(true);
  });

  it("skips when an authoritative SENAT/AN mandate of the same type exists", () => {
    const existing = [
      {
        type: MandateType.DEPUTE,
        source: DataSource.ASSEMBLEE_NATIONALE,
        startDate: "2024-07-08",
        isCurrent: true,
      },
    ];
    const candidate = {
      type: MandateType.DEPUTE,
      startDate: new Date("2024-01-01"),
      isCurrent: true,
    };
    expect(isDuplicateMandateCandidate(existing, candidate)).toBe(true);
  });

  it("allows a different mandate type (cumul DEPUTE + other type is legitimate)", () => {
    const existing = [
      {
        type: MandateType.SENATEUR,
        source: DataSource.SENAT,
        startDate: "2020-10-01",
        isCurrent: true,
      },
    ];
    const candidate = {
      type: MandateType.MAIRE,
      startDate: new Date("2020-10-01"),
      isCurrent: true,
    };
    expect(isDuplicateMandateCandidate(existing, candidate)).toBe(false);
  });

  it("allows backfilling a historical (ended) parliamentary mandate that does not overlap an existing one", () => {
    // Candidate is NOT active, existing active one starts far later → the
    // active-active rule does not apply and the 30-day tolerance lets the
    // historical row through.
    const existing = [
      {
        type: MandateType.SENATEUR,
        source: null,
        startDate: "2020-10-01",
        isCurrent: true,
      },
    ];
    const candidate = {
      type: MandateType.SENATEUR,
      startDate: new Date("2008-09-21"),
      isCurrent: false,
    };
    expect(isDuplicateMandateCandidate(existing, candidate)).toBe(false);
  });

  it("keeps the 30-day start tolerance for non-parliamentary types", () => {
    const existing = [
      {
        type: MandateType.MAIRE,
        source: DataSource.RNE,
        startDate: "2020-05-20",
        isCurrent: true,
      },
    ];
    expect(
      isDuplicateMandateCandidate(existing, {
        type: MandateType.MAIRE,
        startDate: new Date("2020-05-25"),
        isCurrent: true,
      })
    ).toBe(true);
    expect(
      isDuplicateMandateCandidate(existing, {
        type: MandateType.MAIRE,
        startDate: new Date("2021-05-25"),
        isCurrent: true,
      })
    ).toBe(false);
  });

  it("treats a mandate entered to the year as the same term anywhere in that year", () => {
    // A mandate typed in the admin as "2001" is stored on 1 January with YEAR precision. With the
    // 30-day tolerance alone, Wikidata's real start date created a second mandate.
    const existing = [
      {
        type: MandateType.MAIRE,
        source: DataSource.MANUAL,
        startDate: "2001-01-01",
        startDatePrecision: "YEAR" as const,
        isCurrent: false,
      },
    ];
    const candidate = (date: string) => ({
      type: MandateType.MAIRE,
      startDate: new Date(date),
      isCurrent: false,
    });
    expect(isDuplicateMandateCandidate(existing, candidate("2001-03-25"))).toBe(true);
    expect(isDuplicateMandateCandidate(existing, candidate("2008-03-21"))).toBe(false);
    // Same stored date known to the day: the 30-day rule still applies.
    expect(
      isDuplicateMandateCandidate(
        [{ ...existing[0]!, startDatePrecision: "DAY" as const }],
        candidate("2001-03-25")
      )
    ).toBe(false);
  });
});
