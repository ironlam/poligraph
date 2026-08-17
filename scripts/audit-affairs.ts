/**
 * Script d'audit des affaires judiciaires
 *
 * Vérifie :
 * - Affaires sans source
 * - Sources avec URLs inaccessibles (404, etc.)
 * - Catégories sensibles (AGRESSION_SEXUELLE, HARCELEMENT_SEXUEL)
 * - Statuts CONDAMNATION_DEFINITIVE à vérifier
 * - Politiciens décédés avec status actif (MISE_EN_EXAMEN, PROCES_EN_COURS...)
 * - Contradictions description/status (regex)
 * - Doublons potentiels (même politicien + même factsDate + même verdictDate)
 * - Affaires dont toutes les sources sont Wikipedia
 *
 * Usage :
 *   npx tsx scripts/audit-affairs.ts
 *   npx tsx scripts/audit-affairs.ts --check-urls  # Vérifie les URLs (lent)
 *   npx tsx scripts/audit-affairs.ts --export      # Exporte en CSV
 */

import "dotenv/config";
import { AffairCategory, AffairStatus } from "../src/generated/prisma";
import { db } from "../src/lib/db.js";
import * as fs from "fs";
import { HTTPClient, HTTPError } from "@/lib/api/http-client";

// Sensitive categories that require manual verification
const SENSITIVE_CATEGORIES: AffairCategory[] = ["AGRESSION_SEXUELLE", "HARCELEMENT_SEXUEL"];

// Statuses that require verification (ensure no appeal in progress)
const DEFINITIVE_STATUSES: AffairStatus[] = ["CONDAMNATION_DEFINITIVE"];

// Active statuses that should not exist for deceased politicians
const ACTIVE_STATUSES: AffairStatus[] = [
  "ENQUETE_PRELIMINAIRE",
  "INSTRUCTION",
  "MISE_EN_EXAMEN",
  "RENVOI_TRIBUNAL",
  "PROCES_EN_COURS",
];

const auditHttp = new HTTPClient({ timeout: 10_000, retries: 0 });

// Patterns that contradict a CONDAMNATION status in descriptions
// Keep patterns tight to avoid cross-sentence false positives
const NO_CONVICTION_PATTERNS = [
  /aucune condamnation/i,
  /pas de condamnation/i,
  /pas .{0,30}condamn[eé]/i,
  /ne mentionn\w* pas .{0,40}condamnation/i,
  /sans suite judiciaire/i,
  /pas de poursuites/i,
  /aucune.{0,20}poursuite/i,
  /pas .{0,20}condamnation judiciaire/i,
];

interface AuditResult {
  affairsWithoutSources: AffairInfo[];
  brokenUrls: BrokenUrl[];
  sensitiveCategories: AffairInfo[];
  definitiveToVerify: AffairInfo[];
  deceasedActiveStatus: AffairInfo[];
  descriptionContradictions: AffairInfo[];
  potentialDuplicates: DuplicateGroup[];
  wikipediaOnlySources: AffairInfo[];
  summary: {
    totalAffairs: number;
    withoutSources: number;
    brokenUrls: number;
    sensitiveCount: number;
    definitiveCount: number;
    deceasedActiveCount: number;
    contradictionCount: number;
    duplicateGroupCount: number;
    wikipediaOnlyCount: number;
  };
}

interface DuplicateGroup {
  politicianName: string;
  factsDate: string;
  verdictDate: string | null;
  affairs: AffairInfo[];
}

interface AffairInfo {
  id: string;
  title: string;
  politicianName: string;
  category: AffairCategory;
  status: AffairStatus;
  sourceCount: number;
  sourceUrls: string[];
}

interface BrokenUrl {
  affairId: string;
  affairTitle: string;
  politicianName: string;
  url: string;
  error: string;
}

/**
 * Check if a URL is accessible
 */
async function checkUrl(url: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await auditHttp.head(url);
    return { ok: true };
  } catch (error) {
    if (error instanceof HTTPError) return { ok: false, error: `HTTP ${error.status}` };
    if (error instanceof Error) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "Unknown error" };
  }
}

/**
 * Fetch all affairs with sources and politician info
 */
async function fetchAffairs() {
  return db.affair.findMany({
    where: { publicationStatus: "PUBLISHED" },
    include: {
      sources: true,
      politician: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          deathDate: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Run the audit
 */
async function runAudit(checkUrls: boolean): Promise<AuditResult> {
  console.log("Fetching affairs from database...");
  const affairs = await fetchAffairs();
  console.log(`Found ${affairs.length} affairs\n`);

  const result: AuditResult = {
    affairsWithoutSources: [],
    brokenUrls: [],
    sensitiveCategories: [],
    definitiveToVerify: [],
    deceasedActiveStatus: [],
    descriptionContradictions: [],
    potentialDuplicates: [],
    wikipediaOnlySources: [],
    summary: {
      totalAffairs: affairs.length,
      withoutSources: 0,
      brokenUrls: 0,
      sensitiveCount: 0,
      definitiveCount: 0,
      deceasedActiveCount: 0,
      contradictionCount: 0,
      duplicateGroupCount: 0,
      wikipediaOnlyCount: 0,
    },
  };

  const allUrls: { affair: (typeof affairs)[0]; url: string }[] = [];

  // Build map for duplicate detection: politicianId -> affairs grouped by factsDate+verdictDate
  const dupeMap = new Map<string, (typeof affairs)[0][]>();

  for (const affair of affairs) {
    const politicianName = `${affair.politician.firstName} ${affair.politician.lastName}`;
    const affairInfo: AffairInfo = {
      id: affair.id,
      title: affair.title,
      politicianName,
      category: affair.category,
      status: affair.status,
      sourceCount: affair.sources.length,
      sourceUrls: affair.sources.map((s) => s.url),
    };

    // Check: no sources
    if (affair.sources.length === 0) {
      result.affairsWithoutSources.push(affairInfo);
      result.summary.withoutSources++;
    }

    // Check: sensitive categories
    if (SENSITIVE_CATEGORIES.includes(affair.category)) {
      result.sensitiveCategories.push(affairInfo);
      result.summary.sensitiveCount++;
    }

    // Check: definitive convictions
    if (DEFINITIVE_STATUSES.includes(affair.status)) {
      result.definitiveToVerify.push(affairInfo);
      result.summary.definitiveCount++;
    }

    // Check: deceased politician with active judicial status
    if (affair.politician.deathDate && ACTIVE_STATUSES.includes(affair.status)) {
      result.deceasedActiveStatus.push(affairInfo);
      result.summary.deceasedActiveCount++;
    }

    // Check: description contradicts conviction status
    if (affair.status.startsWith("CONDAMNATION") && affair.description) {
      for (const pattern of NO_CONVICTION_PATTERNS) {
        if (pattern.test(affair.description)) {
          result.descriptionContradictions.push(affairInfo);
          result.summary.contradictionCount++;
          break;
        }
      }
    }

    // Check: all sources are Wikipedia
    if (affair.sources.length > 0 && affair.sources.every((s) => s.url.includes("wikipedia.org"))) {
      result.wikipediaOnlySources.push(affairInfo);
      result.summary.wikipediaOnlyCount++;
    }

    // Collect for duplicate detection
    if (affair.factsDate) {
      const key = `${affair.politicianId}|${affair.factsDate.toISOString().split("T")[0]}|${affair.verdictDate?.toISOString().split("T")[0] ?? "null"}`;
      if (!dupeMap.has(key)) dupeMap.set(key, []);
      dupeMap.get(key)!.push(affair);
    }

    // Collect URLs for checking
    if (checkUrls) {
      for (const source of affair.sources) {
        allUrls.push({ affair, url: source.url });
      }
    }
  }

  // Process duplicates
  for (const [, group] of dupeMap) {
    if (group.length < 2) continue;
    const first = group[0]!;
    const politicianName = `${first.politician.firstName} ${first.politician.lastName}`;
    result.potentialDuplicates.push({
      politicianName,
      factsDate: first.factsDate!.toISOString().split("T")[0]!,
      verdictDate: first.verdictDate?.toISOString().split("T")[0] ?? null,
      affairs: group.map((a) => ({
        id: a.id,
        title: a.title,
        politicianName,
        category: a.category,
        status: a.status,
        sourceCount: a.sources.length,
        sourceUrls: a.sources.map((s) => s.url),
      })),
    });
    result.summary.duplicateGroupCount++;
  }

  // Check URLs if requested
  if (checkUrls && allUrls.length > 0) {
    console.log(`Checking ${allUrls.length} URLs (this may take a while)...\n`);

    for (let i = 0; i < allUrls.length; i++) {
      const { affair, url } = allUrls[i]!;
      const politicianName = `${affair.politician.firstName} ${affair.politician.lastName}`;

      process.stdout.write(`  [${i + 1}/${allUrls.length}] Checking ${url.substring(0, 50)}...`);

      const { ok, error } = await checkUrl(url);

      if (!ok) {
        console.log(` BROKEN (${error})`);
        result.brokenUrls.push({
          affairId: affair.id,
          affairTitle: affair.title,
          politicianName,
          url,
          error: error || "Unknown",
        });
        result.summary.brokenUrls++;
      } else {
        console.log(" OK");
      }

      // Rate limiting
      await new Promise((r) => setTimeout(r, 200));
    }
    console.log();
  }

  return result;
}

/**
 * Print the audit report
 */
function printReport(result: AuditResult) {
  console.log("=".repeat(60));
  console.log("AUDIT REPORT - AFFAIRES JUDICIAIRES");
  console.log("=".repeat(60));
  console.log();

  console.log("SUMMARY");
  console.log("-".repeat(40));
  console.log(`Total affairs:           ${result.summary.totalAffairs}`);
  console.log(
    `Without sources:         ${result.summary.withoutSources} ${result.summary.withoutSources > 0 ? "⚠️" : "✓"}`
  );
  console.log(
    `Broken URLs:             ${result.summary.brokenUrls} ${result.summary.brokenUrls > 0 ? "⚠️" : "✓"}`
  );
  console.log(
    `Deceased + active status: ${result.summary.deceasedActiveCount} ${result.summary.deceasedActiveCount > 0 ? "⚠️" : "✓"}`
  );
  console.log(
    `Desc/status contradictions: ${result.summary.contradictionCount} ${result.summary.contradictionCount > 0 ? "⚠️" : "✓"}`
  );
  console.log(
    `Potential duplicates:    ${result.summary.duplicateGroupCount} ${result.summary.duplicateGroupCount > 0 ? "⚠️" : "✓"}`
  );
  console.log(
    `Wikipedia-only sources:  ${result.summary.wikipediaOnlyCount} ${result.summary.wikipediaOnlyCount > 0 ? "⚠️" : "✓"}`
  );
  console.log(`Sensitive categories:    ${result.summary.sensitiveCount} (require manual review)`);
  console.log(`Definitive convictions:  ${result.summary.definitiveCount} (require verification)`);
  console.log();

  if (result.affairsWithoutSources.length > 0) {
    console.log("AFFAIRS WITHOUT SOURCES (CRITICAL)");
    console.log("-".repeat(40));
    for (const affair of result.affairsWithoutSources) {
      console.log(`  - ${affair.politicianName}: "${affair.title}"`);
      console.log(`    Category: ${affair.category}, Status: ${affair.status}`);
    }
    console.log();
  }

  if (result.brokenUrls.length > 0) {
    console.log("BROKEN URLs");
    console.log("-".repeat(40));
    for (const broken of result.brokenUrls) {
      console.log(`  - ${broken.politicianName}: "${broken.affairTitle}"`);
      console.log(`    URL: ${broken.url}`);
      console.log(`    Error: ${broken.error}`);
    }
    console.log();
  }

  if (result.sensitiveCategories.length > 0) {
    console.log("SENSITIVE CATEGORIES (REQUIRE MANUAL VERIFICATION)");
    console.log("-".repeat(40));
    for (const affair of result.sensitiveCategories) {
      console.log(`  - ${affair.politicianName}: "${affair.title}"`);
      console.log(`    Category: ${affair.category}, Status: ${affair.status}`);
      if (affair.sourceUrls.length > 0) {
        console.log(`    Sources: ${affair.sourceUrls.join(", ")}`);
      }
    }
    console.log();
  }

  if (result.definitiveToVerify.length > 0) {
    console.log("DEFINITIVE CONVICTIONS (VERIFY NO APPEAL IN PROGRESS)");
    console.log("-".repeat(40));
    for (const affair of result.definitiveToVerify) {
      console.log(`  - ${affair.politicianName}: "${affair.title}"`);
      console.log(`    Category: ${affair.category}`);
      if (affair.sourceUrls.length > 0) {
        console.log(`    Sources: ${affair.sourceUrls.join(", ")}`);
      }
    }
    console.log();
  }

  if (result.deceasedActiveStatus.length > 0) {
    console.log("DECEASED POLITICIANS WITH ACTIVE STATUS (CRITICAL)");
    console.log("-".repeat(40));
    for (const affair of result.deceasedActiveStatus) {
      console.log(`  - ${affair.politicianName}: "${affair.title}"`);
      console.log(`    Status: ${affair.status} (should be CLASSEMENT_SANS_SUITE)`);
    }
    console.log();
  }

  if (result.descriptionContradictions.length > 0) {
    console.log("DESCRIPTION/STATUS CONTRADICTIONS (CRITICAL)");
    console.log("-".repeat(40));
    console.log("  Description says no conviction, but status is CONDAMNATION_*");
    for (const affair of result.descriptionContradictions) {
      console.log(`  - ${affair.politicianName}: "${affair.title}"`);
      console.log(`    Status: ${affair.status}`);
    }
    console.log();
  }

  if (result.potentialDuplicates.length > 0) {
    console.log("POTENTIAL DUPLICATES (same politician + factsDate + verdictDate)");
    console.log("-".repeat(40));
    for (const group of result.potentialDuplicates) {
      console.log(
        `  ${group.politicianName} - ${group.factsDate} / ${group.verdictDate ?? "no verdict"}`
      );
      for (const a of group.affairs) {
        console.log(`    - [${a.status}] "${a.title}"`);
      }
    }
    console.log();
  }

  if (result.wikipediaOnlySources.length > 0) {
    console.log("WIKIPEDIA-ONLY SOURCES (need journalistic sources)");
    console.log("-".repeat(40));
    for (const affair of result.wikipediaOnlySources) {
      console.log(`  - ${affair.politicianName}: "${affair.title}"`);
    }
    console.log();
  }

  console.log("=".repeat(60));
  console.log("RECOMMENDATIONS");
  console.log("=".repeat(60));
  console.log();

  if (result.summary.deceasedActiveCount > 0) {
    console.log("1. FIX DECEASED ACTIVE STATUS");
    console.log("   Action publique extinct - update to CLASSEMENT_SANS_SUITE");
    console.log();
  }

  if (result.summary.contradictionCount > 0) {
    console.log("2. FIX DESCRIPTION/STATUS CONTRADICTIONS");
    console.log("   Either the status or the description is wrong. Verify sources.");
    console.log();
  }

  if (result.summary.withoutSources > 0) {
    console.log("3. ADD SOURCES to affairs without documentation");
    console.log("   These affairs are legally risky without sources.");
    console.log();
  }

  if (result.summary.brokenUrls > 0) {
    console.log("4. FIX BROKEN URLS or add archive.org backups");
    console.log("   Use archive.org to create permanent copies.");
    console.log();
  }

  if (result.summary.duplicateGroupCount > 0) {
    console.log("5. REVIEW POTENTIAL DUPLICATES");
    console.log("   Same politician + factsDate + verdictDate. Archive or merge.");
    console.log();
  }

  if (result.summary.wikipediaOnlyCount > 0) {
    console.log("6. ADD JOURNALISTIC SOURCES to Wikipedia-only affairs");
    console.log("   Editorial principle: every affair needs a verifiable journalistic source.");
    console.log();
  }

  if (result.summary.sensitiveCount > 0) {
    console.log("7. VERIFY SENSITIVE CATEGORIES manually");
    console.log("   - AGRESSION_SEXUELLE: confirm it's not simple VIOLENCE");
    console.log("   - HARCELEMENT_SEXUEL: confirm it's not HARCELEMENT_MORAL");
    console.log();
  }

  if (result.summary.definitiveCount > 0) {
    console.log("8. VERIFY DEFINITIVE CONVICTIONS");
    console.log("   - Check that no appeal or cassation is pending");
    console.log("   - If appeal in progress, change to APPEL_EN_COURS");
    console.log();
  }
}

/**
 * Export results to CSV
 */
function exportToCsv(result: AuditResult) {
  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `audit-affairs-${timestamp}.csv`;

  const rows: string[] = ["Type,Politician,Title,Category,Status,Sources,URLs,Issue"];

  for (const affair of result.affairsWithoutSources) {
    rows.push(
      `NO_SOURCE,"${affair.politicianName}","${affair.title}",${affair.category},${affair.status},0,,Missing sources`
    );
  }

  for (const broken of result.brokenUrls) {
    rows.push(
      `BROKEN_URL,"${broken.politicianName}","${broken.affairTitle}",,,,${broken.url},${broken.error}`
    );
  }

  for (const affair of result.sensitiveCategories) {
    rows.push(
      `SENSITIVE,"${affair.politicianName}","${affair.title}",${affair.category},${affair.status},${affair.sourceCount},"${affair.sourceUrls.join(";")}",Needs manual verification`
    );
  }

  for (const affair of result.definitiveToVerify) {
    rows.push(
      `DEFINITIVE,"${affair.politicianName}","${affair.title}",${affair.category},${affair.status},${affair.sourceCount},"${affair.sourceUrls.join(";")}",Verify no appeal pending`
    );
  }

  for (const affair of result.deceasedActiveStatus) {
    rows.push(
      `DECEASED_ACTIVE,"${affair.politicianName}","${affair.title}",${affair.category},${affair.status},${affair.sourceCount},,Status should be CLASSEMENT_SANS_SUITE`
    );
  }

  for (const affair of result.descriptionContradictions) {
    rows.push(
      `CONTRADICTION,"${affair.politicianName}","${affair.title}",${affair.category},${affair.status},${affair.sourceCount},,Description contradicts conviction status`
    );
  }

  for (const group of result.potentialDuplicates) {
    for (const affair of group.affairs) {
      rows.push(
        `DUPLICATE,"${affair.politicianName}","${affair.title}",${affair.category},${affair.status},${affair.sourceCount},,Duplicate: ${group.factsDate}`
      );
    }
  }

  for (const affair of result.wikipediaOnlySources) {
    rows.push(
      `WIKI_ONLY,"${affair.politicianName}","${affair.title}",${affair.category},${affair.status},${affair.sourceCount},"${affair.sourceUrls.join(";")}",Only Wikipedia sources`
    );
  }

  fs.writeFileSync(filename, rows.join("\n"), "utf-8");
  console.log(`\nExported to ${filename}`);
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const checkUrls = args.includes("--check-urls");
  const exportCsv = args.includes("--export");

  console.log("AUDIT DES AFFAIRES JUDICIAIRES");
  console.log("==============================\n");

  if (checkUrls) {
    console.log("Mode: URL checking enabled (slow)\n");
  }

  try {
    const result = await runAudit(checkUrls);
    printReport(result);

    if (exportCsv) {
      exportToCsv(result);
    }

    // Exit with error code if critical issues found
    const criticalCount =
      result.summary.withoutSources +
      result.summary.deceasedActiveCount +
      result.summary.contradictionCount;
    if (criticalCount > 0) {
      console.log(`\n⚠️  ${criticalCount} critical issue(s) found`);
      process.exit(1);
    }

    console.log("\n✓ Audit completed successfully");
  } catch (error) {
    console.error("Error during audit:", error);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();
