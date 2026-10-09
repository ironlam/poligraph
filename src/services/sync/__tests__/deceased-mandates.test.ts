import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ executeRaw: vi.fn(), updateMany: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: { $executeRaw: h.executeRaw, mandate: { updateMany: h.updateMany } },
}));

import { updateDeceasedMandates } from "../deceased";

/** Joins the tagged-template strings so the test reads the SQL actually sent. */
const sentSql = () => (h.executeRaw.mock.calls[0]![0] as TemplateStringsArray).join("?");

beforeEach(() => {
  vi.clearAllMocks();
  h.executeRaw.mockResolvedValue(3);
});

/**
 * A wrong Wikidata link gave 113 living mayors a death date from a namesake (1771, 1842...). The
 * pass then closed their current mandates, with no end date, and clearing the false death
 * reopened nothing: a sitting senator showed no current mandate.
 */
describe("updateDeceasedMandates", () => {
  it("records the death date as the end date, so a wrong closure stays traceable", async () => {
    await updateDeceasedMandates();

    expect(sentSql()).toMatch(/"endDate"\s*=\s*COALESCE\(m\."endDate",\s*p\."deathDate"\)/);
    expect(sentSql()).toMatch(/"isCurrent"\s*=\s*false/);
  });

  it("never closes a mandate that started after the recorded death", async () => {
    await updateDeceasedMandates();

    expect(sentSql()).toMatch(/p\."deathDate"\s*>=\s*m\."startDate"/);
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it("returns the number of mandates closed", async () => {
    expect(await updateDeceasedMandates()).toBe(3);
  });
});
