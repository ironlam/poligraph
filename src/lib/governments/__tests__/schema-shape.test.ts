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

describe("schéma GovernmentAct", () => {
  const act = block("model", "GovernmentAct");
  const government = block("model", "Government");
  const membership = block("model", "MandateGovernment");

  it("jorfId est unique et nullable", () => {
    const l = line(act, "jorfId");
    expect(l).toContain("@unique");
    expect(l).toMatch(/String\?/);
  });

  it("signedAt est une date non nulle", () => {
    const l = line(act, "signedAt");
    expect(l).toContain("@db.Date");
    expect(l).not.toMatch(/DateTime\?/);
  });

  it("les énumérations d'acte existent", () => {
    expect(block("enum", "GovernmentActKind")).toContain("CURRENT_AFFAIRS");
    expect(block("enum", "DateDetermination")).toContain("DEDUCTION");
  });

  const governmentFks = [
    "primeMinisterAppointedActId",
    "formedActId",
    "resignedActId",
    "endedActId",
    "currentAffairsActId",
  ];
  const membershipFks = ["startActId", "endActId", "currentAffairsEndActId"];

  it.each(governmentFks)("Government.%s est une FK nullable indexée", (field) => {
    expect(line(government, field)).toMatch(/String\?/);
    expect(government).toContain(`@@index([${field}])`);
  });

  it.each(membershipFks)("MandateGovernment.%s est une FK nullable indexée", (field) => {
    expect(line(membership, field)).toMatch(/String\?/);
    expect(membership).toContain(`@@index([${field}])`);
  });

  it("toutes les FK vers GovernmentAct sont en Restrict", () => {
    const refs = [government, membership]
      .flatMap((b) => b.split("\n"))
      .filter((l) => l.includes("GovernmentAct?"));
    expect(refs).toHaveLength(8);
    for (const l of refs) expect(l).toContain("onDelete: Restrict");
  });

  it.each([
    "primeMinisterAppointedDetermination",
    "formedDetermination",
    "resignedDetermination",
    "endedDetermination",
  ])("Government.%s est un DateDetermination nullable", (field) => {
    expect(line(government, field)).toMatch(/DateDetermination\?/);
  });

  it.each(["startDetermination", "endDetermination", "currentAffairsEndDetermination"])(
    "MandateGovernment.%s est un DateDetermination nullable",
    (field) => {
      expect(line(membership, field)).toMatch(/DateDetermination\?/);
    }
  );

  it("compositionCheckedAt et currentAffairsEndedAt sont des dates nullables", () => {
    expect(line(government, "compositionCheckedAt")).toMatch(/DateTime\?\s+@db\.Date/);
    expect(line(membership, "currentAffairsEndedAt")).toMatch(/DateTime\?\s+@db\.Date/);
  });
});
