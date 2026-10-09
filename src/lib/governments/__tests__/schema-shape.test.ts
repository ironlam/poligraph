import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

function block(kind: "model" | "enum", name: string): string {
  const match = schema.match(new RegExp(`${kind} ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`${kind} ${name} introuvable dans schema.prisma`);
  return match[1]!;
}

function line(body: string, field: string): string {
  const found = body.split("\n").find((l) => l.trim().startsWith(`${field} `));
  if (!found) throw new Error(`champ ${field} introuvable`);
  return found;
}

describe("schéma Government", () => {
  const government = block("model", "Government");
  const membership = block("model", "MandateGovernment");

  it("slug et sequence sont uniques", () => {
    expect(line(government, "slug")).toContain("@unique");
    expect(line(government, "sequence")).toContain("@unique");
  });

  it("predecessorId est unique et nullable", () => {
    const l = line(membership, "predecessorId");
    expect(l).toContain("@unique");
    expect(l).toMatch(/String\?/);
  });

  it("governmentId est nullable (phase expand)", () => {
    expect(line(membership, "governmentId")).toMatch(/String\?/);
  });

  it("governmentName reste en place", () => {
    expect(line(membership, "governmentName")).toMatch(/String/);
  });

  it("les énumérations de preuve existent", () => {
    expect(block("enum", "DateEvidence")).toContain("DERIVED");
    expect(block("enum", "GovernmentFunctionEnd")).toContain("COLLECTIVE_RESIGNATION");
    expect(block("enum", "GovernmentCompleteness")).toContain("PARTIAL");
  });

  it("Politician porte la relation inverse primeMinisterOf", () => {
    expect(line(block("model", "Politician"), "primeMinisterOf")).toContain("Government[]");
  });
});
