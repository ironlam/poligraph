import fs from "node:fs";
import path from "node:path";

const migrationsRoot = path.resolve("prisma/migrations");
const migrationFiles = fs
  .readdirSync(migrationsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(migrationsRoot, entry.name, "migration.sql"))
  .filter((file) => fs.existsSync(file));

const publicApplicationRole = /^(?:anon|authenticated|public)$/iu;
const tableOrSequenceGrant =
  /\bGRANT\s+[^;]*\bON\s+(?:ALL\s+)?(?:TABLES?|SEQUENCES?)\b[^;]*\bTO\s+([^;]+)/giu;

export function containsForbiddenPublicGrant(sql) {
  const sqlWithoutComments = sql.replace(/--.*$/gmu, "").replace(/\/\*[\s\S]*?\*\//gu, "");

  return [...sqlWithoutComments.matchAll(tableOrSequenceGrant)].some((match) =>
    match[1]
      .split(",")
      .map((role) => role.trim().replace(/^"|"$/gu, ""))
      .some((role) => publicApplicationRole.test(role))
  );
}

const violations = migrationFiles.filter((file) =>
  containsForbiddenPublicGrant(fs.readFileSync(file, "utf8"))
);

if (violations.length > 0) {
  console.error("SEC-03 forbids direct public-role privileges on application tables or sequences.");
  for (const file of violations) console.error(`- ${path.relative(process.cwd(), file)}`);
  process.exit(1);
}

console.log("SEC-03 migration grant guard passed");
