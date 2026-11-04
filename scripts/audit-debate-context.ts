/**
 * READ-ONLY audit: for amendment-linked scrutins that have a "Les enjeux"
 * analysis, report whether a candidate debate transcript actually mentions the
 * voted amendment, and how strongly. No model call, NO DB write.
 *
 *   npx dotenv -e .env -- npx tsx scripts/audit-debate-context.ts --limit 50
 */
import { db } from "@/lib/db";
import { auditDebateContextForAmendmentAnalyses } from "@/services/scrutin-substance/debate-context-resolver";

function arg(name: string): string | undefined {
  const i = process.argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  const v = process.argv[i]!;
  return v.includes("=") ? v.split("=").slice(1).join("=") : process.argv[i + 1];
}
function log(line = ""): void {
  // eslint-disable-next-line no-console
  console.log(line);
}

async function main(): Promise<void> {
  const limit = arg("limit") ? Number(arg("limit")) : undefined;
  log(
    `=== Debate context audit (amendment-linked analyses)${limit ? ` — limit ${limit}` : ""} ===\n`
  );

  const report = await auditDebateContextForAmendmentAnalyses(limit ? { limit } : {});

  log(
    "Les correspondances par date restent diagnostiques ; seule la chaîne structurée autorise une génération.\n"
  );
  log(`scanned : ${report.scanned}`);
  log(
    `HIGH=${report.byConfidence.HIGH}  MEDIUM=${report.byConfidence.MEDIUM}  LOW=${report.byConfidence.LOW}  NONE=${report.byConfidence.NONE}`
  );
  const usable = report.rows.filter((r) => r.usableForGeneration).length;
  const ambiguousDay = report.rows.filter((r) => r.candidateTranscriptCount > 1).length;
  log(`usableForGeneration (séance, texte et discussion vérifiés) : ${usable}`);
  log(`sélections ambiguës (plusieurs comptes rendus candidats) : ${ambiguousDay}\n`);

  const excluded: Record<string, number> = {};
  for (const row of report.rows) {
    if (row.exclusionReason)
      excluded[row.exclusionReason] = (excluded[row.exclusionReason] ?? 0) + 1;
  }
  log(`Discussions exclues : ${JSON.stringify(excluded)}`);

  // Show the HIGH matches (the only ones a future generation could trust).
  for (const r of report.rows.filter((r) => r.confidence === "HIGH")) {
    log(`─ HIGH  amendement ${r.amendment}  ${r.slug ?? r.scrutinId}`);
    log(`  ${r.excerpt}`);
  }
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
