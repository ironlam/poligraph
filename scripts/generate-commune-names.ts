/**
 * Writes the table the legacy commune redirect reads instead of the database
 * (`src/app/api/territoires/commune-redirect/route.ts`).
 *
 * Read-only on the database. Run it again after a communes import that adds or renames
 * communes: a code missing from the table still redirects (the route falls back to the
 * database), but a renamed commune would be sent to its former address.
 *
 * Usage: npm run generate:commune-names
 */
import fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";

const OUTPUT = path.resolve(__dirname, "../src/lib/territoires/commune-names.json");

async function main() {
  const communes = await db.commune.findMany({
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
  const table = Object.fromEntries(communes.map((c) => [c.id, c.name]));
  fs.writeFileSync(OUTPUT, `${JSON.stringify(table, null, 2)}\n`);
  console.log(`${communes.length} communes → ${path.relative(process.cwd(), OUTPUT)}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
