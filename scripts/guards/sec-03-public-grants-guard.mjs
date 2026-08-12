import fs from "node:fs";
import path from "node:path";

const migrationsRoot = path.resolve("prisma/migrations");
const migrationFiles = fs
  .readdirSync(migrationsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(migrationsRoot, entry.name, "migration.sql"))
  .filter((file) => fs.existsSync(file));

const forbiddenGrant =
  /\bGRANT\s+[^;]*\bON\s+(?:ALL\s+)?(?:TABLES?|SEQUENCES?)\b[^;]*\bTO\s+(?:[^;]*,\s*)?(?:anon|authenticated)\b/iu;

const violations = migrationFiles.filter((file) => {
  const sqlWithoutComments = fs
    .readFileSync(file, "utf8")
    .replace(/--.*$/gmu, "")
    .replace(/\/\*[\s\S]*?\*\//gu, "");
  return forbiddenGrant.test(sqlWithoutComments);
});

if (violations.length > 0) {
  console.error("SEC-03 forbids direct public-role grants on application tables or sequences:");
  for (const file of violations) console.error(`- ${path.relative(process.cwd(), file)}`);
  process.exit(1);
}

console.log("SEC-03 migration grant guard passed");
