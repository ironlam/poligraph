import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The Parrainage table is created by hand-applied SQL, not by `db:push`. Nothing else keeps that
 * file and the Prisma model in step, so a column added to one and forgotten in the other would
 * only show up in production.
 */
const root = process.cwd();
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const sql = readFileSync(join(root, "prisma/migrations/manual/2026-11-18-parrainages.sql"), "utf8")
  .replace(/--.*$/gm, "")
  .trim();

const SCALARS = new Set(["String", "DateTime", "Int", "Float", "Boolean", "Json"]);

function modelColumns(model: string): Map<string, boolean> {
  const body = new RegExp(`^model ${model} \\{\\n([\\s\\S]*?)^\\}`, "m").exec(schema)?.[1];
  if (!body) throw new Error(`model ${model} introuvable`);
  const columns = new Map<string, boolean>();
  for (const line of body.split("\n")) {
    const m = /^\s+(\w+)\s+(\w+)(\?)?(\s|$)/.exec(line);
    if (m && SCALARS.has(m[2]!)) columns.set(m[1]!, m[3] !== "?");
  }
  return columns;
}

function sqlColumns(table: string): Map<string, boolean> {
  const body = new RegExp(`CREATE TABLE "${table}" \\(([\\s\\S]*?)\\n\\);`).exec(sql)?.[1];
  if (!body) throw new Error(`CREATE TABLE "${table}" introuvable`);
  const columns = new Map<string, boolean>();
  for (const line of body.split("\n")) {
    const m = /^\s+"(\w+)" /.exec(line);
    if (m) columns.set(m[1]!, line.includes("NOT NULL"));
  }
  return columns;
}

describe("SQL manuel de la table Parrainage", () => {
  it("déclare les mêmes colonnes que le modèle Prisma, avec la même nullabilité", () => {
    const model = modelColumns("Parrainage");
    expect(model.size).toBeGreaterThan(10);
    expect(Object.fromEntries(sqlColumns("Parrainage"))).toEqual(Object.fromEntries(model));
  });

  it("garde nullables les seules colonnes résolues après l'import", () => {
    const nullable = [...modelColumns("Parrainage")].filter(([, required]) => !required);
    expect(nullable.map(([name]) => name).sort()).toEqual([
      "candidacyId",
      "communeCode",
      "departmentCode",
      "politicianId",
    ]);
  });

  it("pose un index pour chaque @@index et la clé d'idempotence", () => {
    for (const columns of [
      ["electionId", "candidateName"],
      ["electionId", "departmentCode"],
      ["communeCode"],
      ["politicianId"],
    ]) {
      expect(schema).toContain(`@@index([${columns.join(", ")}])`);
      expect(sql).toContain(`ON "Parrainage"(${columns.map((c) => `"${c}"`).join(", ")})`);
    }
    expect(sql).toContain('CREATE UNIQUE INDEX "Parrainage_dedupeKey_key"');
  });

  it("ouvre la table à anon en lecture seule, sans GRANT", () => {
    expect(sql).toContain('ALTER TABLE "Parrainage" ENABLE ROW LEVEL SECURITY');
    const policies = sql.match(/CREATE POLICY[\s\S]*?;/g) ?? [];
    expect(policies).toHaveLength(1);
    expect(policies[0]).toMatch(/ON "Parrainage" FOR SELECT TO anon\s+USING \(true\);/);
    expect(sql).not.toMatch(/\bGRANT\b/i);
  });

  it("ne supprime pas une élection qui porte des présentations", () => {
    expect(sql).toMatch(/"Parrainage_electionId_fkey"[^;]*ON DELETE RESTRICT/);
    expect(sql).toMatch(/"Parrainage_candidacyId_fkey"[^;]*ON DELETE SET NULL/);
    expect(sql).toMatch(/"Parrainage_politicianId_fkey"[^;]*ON DELETE SET NULL/);
  });
});
