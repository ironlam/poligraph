import { describe, it, expect, vi } from "vitest";

// The module builds the DB client on import; the unit CI has no DATABASE_URL.
vi.mock("@/lib/db", () => ({ db: {} }));

import { anArchiveSourceKey, isWithinLastDays } from "@/services/sync/scrutins-an";

const now = new Date("2026-11-02T05:00:00Z");

describe("isWithinLastDays", () => {
  it("keeps today and the days inside the window", () => {
    expect(isWithinLastDays("2026-11-02", 7, now)).toBe(true);
    expect(isWithinLastDays("2026-10-30", 7, now)).toBe(true);
    expect(isWithinLastDays("2026-10-26", 7, now)).toBe(true);
  });

  it("drops what is older than the window", () => {
    expect(isWithinLastDays("2026-10-25", 7, now)).toBe(false);
    expect(isWithinLastDays("2026-10-09", 7, now)).toBe(false);
  });

  it("refuses an unreadable date instead of keeping it", () => {
    expect(isWithinLastDays("pas une date", 7, now)).toBe(false);
  });
});

describe("anArchiveSourceKey", () => {
  it("gives a partial run its own key, so it never marks the full archive as done", () => {
    const full = anArchiveSourceKey(17, { officialGroupsOnly: false, partial: false });
    const partial = anArchiveSourceKey(17, { officialGroupsOnly: false, partial: true });
    expect(full).toBe("votes-an-zip:17");
    expect(partial).not.toBe(full);
  });

  it("keeps the official-groups mode on its own key, partial or not", () => {
    expect(anArchiveSourceKey(17, { officialGroupsOnly: true, partial: true })).toBe(
      "official-groups-an-zip:17"
    );
  });
});
