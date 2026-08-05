#!/usr/bin/env tsx
/**
 * npm run search:audit
 *
 * Exits non-zero when the index holds a document nothing can account for.
 */
import { db } from "@/lib/db";
import { auditSearchDocuments } from "@/lib/search/maintenance";

async function main(): Promise<void> {
  const violations = await auditSearchDocuments();

  if (violations.length === 0) {
    console.log("[search:audit] aucun document orphelin ni de type inconnu");
    return;
  }

  for (const violation of violations) {
    console.error(`[${violation.rule}] ${violation.entityType} ${violation.entityId}`);
  }
  console.error(`\n[search:audit] ${violations.length} document(s) en cause`);
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
