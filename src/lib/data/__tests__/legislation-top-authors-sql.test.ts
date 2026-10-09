import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * TopAuthor declares blobPhotoUrl (#978), but the raw SQL behind it is invisible to TypeScript: it
 * selected only photoUrl, so ranked dossier authors always fell back to the external photo.
 */
describe("getPPLStats top authors query", () => {
  it("selects and groups by the Blob copy", () => {
    const source = readFileSync("src/lib/data/legislation.ts", "utf8");
    const query = source.slice(
      source.indexOf("db.$queryRaw<TopAuthor[]>"),
      source.indexOf("db.$queryRaw<TopParty[]>")
    );
    expect(query).toMatch(/p\."blobPhotoUrl",/);
    expect(query).toMatch(/GROUP BY[^\n]*p\."blobPhotoUrl"/);
  });
});
