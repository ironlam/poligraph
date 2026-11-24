import { describe, expect, it } from "vitest";
import {
  archiveMonthOfDay,
  archiveMonthRange,
  formatArchiveMonth,
  parseArchiveMonth,
  voteArchiveMonthPath,
} from "@/lib/votes/vote-archive";

describe("parseArchiveMonth", () => {
  it("reads a four-digit year and a two-digit month", () => {
    expect(parseArchiveMonth("2025", "11")).toEqual({ year: 2025, month: 11 });
    expect(parseArchiveMonth("2022", "07")).toEqual({ year: 2022, month: 7 });
  });

  it.each([
    ["2025", "7"],
    ["2025", "13"],
    ["2025", "00"],
    ["2025", "07x"],
    ["25", "07"],
    ["2025-07", "07"],
  ])("refuses %s/%s, so a month has a single address", (annee, mois) => {
    expect(parseArchiveMonth(annee, mois)).toBeNull();
  });
});

describe("archive month helpers", () => {
  it("builds the address with a padded month", () => {
    expect(voteArchiveMonthPath({ year: 2022, month: 7 })).toBe(
      "/parlement/votes/archives/2022/07"
    );
  });

  it("round-trips an address through the parser", () => {
    const [, , , , annee, mois] = voteArchiveMonthPath({ year: 2026, month: 3 }).split("/");
    expect(parseArchiveMonth(annee!, mois!)).toEqual({ year: 2026, month: 3 });
  });

  it("covers the month in UTC, December rolling over to January", () => {
    const { start, end } = archiveMonthRange({ year: 2025, month: 12 });
    expect(start.toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("finds the month of a daily page", () => {
    expect(archiveMonthOfDay("2022-07-12")).toEqual({ year: 2022, month: 7 });
  });

  it("names the month in French", () => {
    expect(formatArchiveMonth({ year: 2025, month: 2 })).toBe("février 2025");
  });
});
