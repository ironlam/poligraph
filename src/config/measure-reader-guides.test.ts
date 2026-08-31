import { describe, expect, it } from "vitest";
import { MEASURE_READER_GUIDES } from "./measure-reader-guides";
import { isOfficialInstitutionUrl } from "@/lib/measures/reader-guide-source";

describe("catalogue des repères citoyens", () => {
  it("utilise des slugs et alias uniques avec une source officielle", () => {
    const slugs = new Set<string>();
    const aliases = new Set<string>();
    for (const guide of MEASURE_READER_GUIDES) {
      expect(slugs.has(guide.slug)).toBe(false);
      slugs.add(guide.slug);
      expect(isOfficialInstitutionUrl(guide.sourceUrl)).toBe(true);
      expect(guide.definition.length).toBeGreaterThan(40);
      for (const alias of [guide.label, ...guide.aliases]) {
        const normalized = alias.toLocaleLowerCase("fr");
        expect(aliases.has(normalized)).toBe(false);
        aliases.add(normalized);
      }
    }
  });
});
