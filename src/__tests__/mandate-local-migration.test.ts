import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * These columns and this enum value reach production through hand-applied SQL, not `db:push`.
 * Nothing else keeps that file and the Prisma schema in step, so a column added to one and
 * forgotten in the other would only show up in production.
 */
const root = process.cwd();
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const sql = readFileSync(
  join(root, "prisma/migrations/manual/2026-11-26-mandate-date-precision-epci.sql"),
  "utf8"
)
  .replace(/--.*$/gm, "")
  .trim();

function block(kind: "model" | "enum", name: string): string {
  const body = new RegExp(`^${kind} ${name} \\{\\n([\\s\\S]*?)^\\}`, "m").exec(schema)?.[1];
  if (!body) throw new Error(`${kind} ${name} introuvable`);
  return body;
}

/** The declaration of a field, comments and alignment spaces removed. */
function field(model: string, name: string): string | undefined {
  const line = block("model", model)
    .split("\n")
    .find((l) => new RegExp(`^\\s+${name}\\s`).test(l));
  return line
    ?.replace(/\/\/.*$/, "")
    .trim()
    .replace(/\s+/g, " ");
}

const statements = sql
  .split(";")
  .map((s) => s.trim().replace(/\s+/g, " "))
  .filter(Boolean);

describe("SQL manuel des mandats locaux saisis à la main", () => {
  it("ajoute la précision des deux dates, obligatoire et au jour par défaut", () => {
    expect(field("Mandate", "startDatePrecision")).toBe(
      "startDatePrecision DatePrecision @default(DAY)"
    );
    expect(field("Mandate", "endDatePrecision")).toBe(
      "endDatePrecision DatePrecision @default(DAY)"
    );
    expect(statements).toContain(
      `ALTER TABLE "Mandate" ADD COLUMN IF NOT EXISTS "startDatePrecision" "DatePrecision" NOT NULL DEFAULT 'DAY'`
    );
    expect(statements).toContain(
      `ALTER TABLE "Mandate" ADD COLUMN IF NOT EXISTS "endDatePrecision" "DatePrecision" NOT NULL DEFAULT 'DAY'`
    );
  });

  it("ajoute le SIREN d'intercommunalité, facultatif", () => {
    expect(field("MandateLocal", "epciSiren")).toBe("epciSiren String?");
    expect(statements).toContain(
      `ALTER TABLE "MandateLocal" ADD COLUMN IF NOT EXISTS "epciSiren" TEXT`
    );
  });

  it("ajoute la présidence d'intercommunalité aux types de mandat", () => {
    expect(block("enum", "MandateType")).toMatch(/^\s+PRESIDENT_INTERCOMMUNALITE$/m);
    expect(statements).toContain(
      `ALTER TYPE "MandateType" ADD VALUE IF NOT EXISTS 'PRESIDENT_INTERCOMMUNALITE'`
    );
  });

  it("ne contient rien d'autre et peut être rejoué", () => {
    expect(statements).toHaveLength(4);
    for (const statement of statements) expect(statement).toContain("IF NOT EXISTS");
  });
});
