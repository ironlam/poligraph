#!/usr/bin/env tsx
/**
 * npm run measures:audit
 *
 * Exits non-zero when an invariant is violated, so it can be wired into CI or a cron
 * without being interpreted by hand.
 */
import { db } from "@/lib/db";
import { auditMeasures } from "@/lib/measures/audit";

async function main(): Promise<void> {
  const violations = await auditMeasures();

  if (violations.length === 0) {
    console.log("[measures:audit] aucun invariant violé");
    return;
  }

  const byRule = new Map<string, number>();
  for (const v of violations) {
    byRule.set(v.rule, (byRule.get(v.rule) ?? 0) + 1);
    console.error(`[${v.rule}] mesure=${v.measureId ?? "-"} ${v.detail}`);
  }

  console.error(`\n[measures:audit] ${violations.length} violation(s) :`);
  for (const [rule, count] of [...byRule].sort((a, b) => b[1] - a[1])) {
    console.error(`  ${count.toString().padStart(5)}  ${rule}`);
  }
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
