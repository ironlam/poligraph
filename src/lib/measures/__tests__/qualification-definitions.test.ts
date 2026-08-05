import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { QualificationKind } from "@/generated/prisma";

/**
 * Unit test, no database: the plan checked this coverage with a manual grep, which holds
 * exactly until someone adds a fifth enum value. A closed enum whose values have no
 * opposable definition guarantees nothing, so the definitions are part of the contract and
 * CI is where a missing one has to surface.
 *
 * Reading the enum from the generated client rather than a hardcoded list is the point: a
 * new value fails this test until its section exists.
 */
const DOC = join(process.cwd(), "docs/editorial/qualifications-mesures.md");
const source = readFileSync(DOC, "utf8");

/** The five parts each definition must carry, per the editorial contract. */
const REQUIRED_PARTS = [
  "Ce que le qualificatif affirme",
  "Corpus examiné",
  "Deux exemples positifs",
  "Deux exemples négatifs",
  "Ce que le qualificatif n'affirme pas",
];

function sectionOf(value: string): string {
  const start = source.indexOf(`## ${value}`);
  if (start === -1) return "";
  const rest = source.slice(start);
  const end = rest.indexOf("\n---");
  return end === -1 ? rest : rest.slice(0, end);
}

describe("définitions opposables des qualificatifs", () => {
  const values = Object.values(QualificationKind);

  it("couvre effectivement des valeurs, sinon la règle est vide", () => {
    expect(values.length).toBeGreaterThanOrEqual(4);
  });

  it.each(values)("%s a sa section", (value) => {
    expect(sectionOf(value)).not.toBe("");
  });

  it.each(values)("%s énonce ses cinq parties", (value) => {
    const section = sectionOf(value);
    for (const part of REQUIRED_PARTS) {
      expect(section, `partie manquante dans ${value} : ${part}`).toContain(part);
    }
  });

  it.each(values)("%s borne sa lecture par un cas limite", (value) => {
    // Without a borderline case a definition reduces to its own title, and two reviewers
    // apply it on different criteria. This is the part most likely to be skipped.
    expect(sectionOf(value)).toContain("Cas limite");
  });

  it("est écrit sans tiret cadratin", () => {
    // Repository-wide rule for human-facing text.
    expect(source).not.toMatch(/[—–]/);
  });
});
