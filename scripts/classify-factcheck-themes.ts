/**
 * Backfill the theme of the fact-checks the sync never classified (lot 4a).
 *
 * Dry run by default: classifies, prints and optionally saves the proposals, writes nothing.
 *
 * Usage:
 *   npx tsx scripts/classify-factcheck-themes.ts --limit=50 --out=propositions.json   # sample
 *   npx tsx scripts/classify-factcheck-themes.ts --apply                              # write
 *
 * Only fact-checks with no `themeClassifiedAt` and no `themeReviewedAt` are read, and the write
 * repeats both conditions: a theme validated in the admin is never overwritten, and a second run
 * does not ask the model again about what it already classified. Public fact-checks come first,
 * most recent first. One call at a time.
 *
 * Requires MISTRAL_API_KEY (Anthropic as fallback). Writes to the database `.env` points at, which
 * is production: apply prisma/migrations/manual/2026-11-22-factcheck-theme.sql first.
 */

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { db } from "../src/lib/db";
import { getPublicFactCheckWhere } from "../src/lib/api/public-contract";
import { classifyFactCheckTheme } from "../src/services/classify-theme";

function readArg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

async function main() {
  const apply = process.argv.includes("--apply");
  const limitArg = readArg("limit");
  const limit = limitArg ? Number.parseInt(limitArg, 10) : undefined;
  const out = readArg("out");
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error(`--limit attend un entier positif, reçu « ${limitArg} »`);
  }

  const unclassified = { themeClassifiedAt: null, themeReviewedAt: null };
  const select = { id: true, slug: true, title: true, claimText: true, verdict: true } as const;
  const publicRows = await db.factCheck.findMany({
    where: { ...unclassified, ...getPublicFactCheckWhere() },
    select,
    orderBy: { publishedAt: "desc" },
    take: limit,
  });
  const rest =
    limit === undefined || publicRows.length < limit
      ? await db.factCheck.findMany({
          where: { ...unclassified, id: { notIn: publicRows.map((r) => r.id) } },
          select,
          orderBy: { publishedAt: "desc" },
          take: limit === undefined ? undefined : limit - publicRows.length,
        })
      : [];
  const rows = [...publicRows, ...rest];

  console.log(`${rows.length} fact-check(s) à classer${apply ? "" : " (essai, rien n'est écrit)"}`);

  const proposals: { slug: string | null; title: string; claimText: string; theme: string }[] = [];
  const counts = { theme: 0, none: 0, invalid: 0, failed: 0, written: 0 };

  for (const [i, row] of rows.entries()) {
    let label: string;
    try {
      const result = await classifyFactCheckTheme(row);
      counts[result.status]++;
      label =
        result.status === "theme" ? result.theme : result.status === "none" ? "AUCUN" : "INVALIDE";
      if (apply && result.status !== "invalid") {
        const { count } = await db.factCheck.updateMany({
          where: { id: row.id, ...unclassified },
          data: {
            theme: result.status === "theme" ? result.theme : null,
            themeClassifiedAt: new Date(),
          },
        });
        counts.written += count;
      }
    } catch (error) {
      counts.failed++;
      label = "ÉCHEC";
      console.warn(`  échec sur ${row.slug ?? row.id} : ${error}`);
    }
    proposals.push({ slug: row.slug, title: row.title, claimText: row.claimText, theme: label });
    console.log(`  [${i + 1}/${rows.length}] ${label.padEnd(28)} ${row.title.slice(0, 90)}`);
  }

  console.log(
    `\nThème : ${counts.theme}, aucun thème : ${counts.none}, réponse hors liste : ${counts.invalid}, échecs : ${counts.failed}` +
      (apply ? `, écrits : ${counts.written}` : "")
  );
  if (out) {
    writeFileSync(out, JSON.stringify(proposals, null, 2));
    console.log(`Propositions enregistrées dans ${out}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
