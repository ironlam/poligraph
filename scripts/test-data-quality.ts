#!/usr/bin/env tsx
/**
 * Data Quality Tests
 *
 * Validates the integrity and completeness of the database:
 * - Missing photos
 * - Missing parties
 * - Orphan mandates
 * - Affairs without sources
 * - Potential duplicates
 *
 * Usage:
 *   npm run test:data              # Run all checks
 *   npm run test:data -- --fix     # Attempt to fix issues
 *   npm run test:data -- --json    # JSON output
 */

import "dotenv/config";
import { db } from "../src/lib/db";
import { MandateType } from "../src/generated/prisma";

interface QualityCheck {
  name: string;
  description: string;
  critical: boolean;
  check: () => Promise<{ passed: boolean; count: number; details?: string[] }>;
}

const CHECKS: QualityCheck[] = [
  // === CRITICAL CHECKS ===
  {
    name: "affairs-without-sources",
    description: "Affaires publiables sans source (CRITIQUE - risque juridique)",
    critical: true,
    check: async () => {
      // Only DRAFT/PUBLISHED affairs are a legal risk: they are public or about
      // to be. ARCHIVED/EXCLUDED/REJECTED are hidden by design (rejected duplicates,
      // wrong attributions, victim cases), where a missing source is expected.
      const affairs = await db.affair.findMany({
        where: {
          sources: { none: {} },
          publicationStatus: { in: ["DRAFT", "PUBLISHED"] },
        },
        select: { id: true, title: true, politician: { select: { fullName: true } } },
      });
      return {
        passed: affairs.length === 0,
        count: affairs.length,
        details: affairs.slice(0, 10).map((a) => `${a.politician.fullName}: ${a.title}`),
      };
    },
  },
  {
    name: "current-mandates-without-start",
    description: "Mandats actuels sans date de début",
    critical: false,
    check: async () => {
      // Use raw query for null check (Prisma 7 limitation)
      const mandates = await db.$queryRaw<{ fullName: string; title: string }[]>`
        SELECT p."fullName", m.title
        FROM "Mandate" m
        JOIN "Politician" p ON m."politicianId" = p.id
        WHERE m."isCurrent" = true AND m."startDate" IS NULL
        LIMIT 20
      `;
      return {
        passed: mandates.length < 10,
        count: mandates.length,
        details: mandates.slice(0, 10).map((m) => `${m.fullName}: ${m.title}`),
      };
    },
  },

  {
    name: "mandate-titles-gluing-two-people",
    description: "Titres de mandat recollant deux personnes (corruption de source)",
    critical: false,
    check: async () => {
      // A lowercase letter immediately followed by an uppercase one never
      // occurs in a real mandate title ("d'État" has an apostrophe,
      // "Outre-mer" a hyphen). It does occur when an upstream row merges two
      // people, as the data.gouv.fr government CSV did for Pierre Messmer
      // (#664). The government importer now cuts at that boundary; this check
      // catches the same corruption arriving through any other source.
      const mandates = await db.$queryRaw<{ fullName: string; title: string }[]>`
        SELECT p."fullName", m.title
        FROM "Mandate" m
        JOIN "Politician" p ON m."politicianId" = p.id
        WHERE m.title ~ '[a-zà-ÿ][A-ZÀ-Ý]'
        LIMIT 20
      `;
      return {
        passed: mandates.length === 0,
        count: mandates.length,
        details: mandates.slice(0, 10).map((m) => `${m.fullName}: ${m.title.slice(0, 80)}`),
      };
    },
  },

  // === IMPORTANT CHECKS ===
  {
    name: "deputies-without-photo",
    description: "Députés sans photo",
    critical: false,
    check: async () => {
      const deputies = await db.politician.findMany({
        where: {
          photoUrl: null,
          mandates: {
            some: { type: MandateType.DEPUTE, isCurrent: true },
          },
        },
        select: { fullName: true },
      });
      return {
        passed: deputies.length < 10, // Allow some missing
        count: deputies.length,
        details: deputies.slice(0, 10).map((p) => p.fullName),
      };
    },
  },
  {
    name: "senators-without-photo",
    description: "Sénateurs sans photo",
    critical: false,
    check: async () => {
      const senators = await db.politician.findMany({
        where: {
          photoUrl: null,
          mandates: {
            some: { type: MandateType.SENATEUR, isCurrent: true },
          },
        },
        select: { fullName: true },
      });
      return {
        passed: senators.length < 10,
        count: senators.length,
        details: senators.slice(0, 10).map((p) => p.fullName),
      };
    },
  },
  {
    name: "politicians-without-party",
    description: "Politiciens avec mandat actuel sans parti",
    critical: false,
    check: async () => {
      const politicians = await db.politician.findMany({
        where: {
          currentPartyId: null,
          mandates: {
            some: { isCurrent: true },
          },
        },
        select: {
          fullName: true,
          mandates: { where: { isCurrent: true }, select: { type: true } },
        },
      });
      // Filter out those who might legitimately have no party
      const partyMandateTypes: MandateType[] = [
        MandateType.DEPUTE,
        MandateType.SENATEUR,
        MandateType.DEPUTE_EUROPEEN,
      ];
      const suspicious = politicians.filter((p) =>
        p.mandates.some((m) => partyMandateTypes.includes(m.type))
      );
      return {
        passed: suspicious.length < 200,
        count: suspicious.length,
        details: suspicious.slice(0, 10).map((p) => p.fullName),
      };
    },
  },
  {
    name: "old-mandates-still-current",
    description: "Mandats de plus de 10 ans encore marqués 'actuel'",
    critical: false,
    check: async () => {
      const tenYearsAgo = new Date();
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

      const mandates = await db.mandate.findMany({
        where: {
          isCurrent: true,
          startDate: { lt: tenYearsAgo },
          type: { not: MandateType.PRESIDENT_PARTI },
        },
        select: {
          title: true,
          startDate: true,
          politician: { select: { fullName: true } },
        },
      });
      return {
        passed: mandates.length === 0,
        count: mandates.length,
        details: mandates
          .slice(0, 10)
          .map((m) => `${m.politician.fullName}: ${m.title} (${m.startDate?.getFullYear()})`),
      };
    },
  },

  // === DATA COMPLETENESS ===
  {
    name: "deputy-count",
    description: "Nombre de députés actuels (devrait être ~577)",
    critical: false,
    check: async () => {
      const count = await db.mandate.count({
        where: { type: MandateType.DEPUTE, isCurrent: true },
      });
      return {
        passed: count >= 570 && count <= 580,
        count,
        details: [`Attendu: 577, Trouvé: ${count}`],
      };
    },
  },
  {
    name: "senator-count",
    description: "Nombre de sénateurs actuels (devrait être ~348)",
    critical: false,
    check: async () => {
      const count = await db.mandate.count({
        where: { type: MandateType.SENATEUR, isCurrent: true },
      });
      return {
        passed: count >= 340 && count <= 350,
        count,
        details: [`Attendu: 348, Trouvé: ${count}`],
      };
    },
  },
  {
    name: "government-members",
    description: "Membres du gouvernement actuels (devrait être >30)",
    critical: false,
    check: async () => {
      const ministerTypes = [
        MandateType.PREMIER_MINISTRE,
        MandateType.MINISTRE,
        MandateType.MINISTRE_DELEGUE,
        MandateType.SECRETAIRE_ETAT,
      ];
      const count = await db.mandate.count({
        where: { type: { in: ministerTypes }, isCurrent: true },
      });
      return {
        passed: count >= 30,
        count,
        details: [`Trouvé: ${count} membres`],
      };
    },
  },
  {
    name: "mep-count",
    description: "Eurodéputés français (devrait être ~81)",
    critical: false,
    check: async () => {
      const count = await db.mandate.count({
        where: { type: MandateType.DEPUTE_EUROPEEN, isCurrent: true },
      });
      return {
        passed: count >= 75 && count <= 90, // Allow some variance
        count,
        details: [`Attendu: 81, Trouvé: ${count}`],
      };
    },
  },

  // === POTENTIAL DUPLICATES ===
  {
    name: "potential-duplicates",
    description: "Doublons potentiels (même nom)",
    critical: false,
    check: async () => {
      const duplicates = await db.$queryRaw<{ fullName: string; count: bigint }[]>`
        SELECT "fullName", COUNT(*) as count
        FROM "Politician"
        GROUP BY "fullName"
        HAVING COUNT(*) > 1
      `;
      return {
        passed: duplicates.length < 5,
        count: duplicates.length,
        details: duplicates.slice(0, 10).map((d) => `${d.fullName}: ${d.count} occurrences`),
      };
    },
  },

  // === EMBEDDINGS ===
  {
    name: "embeddings-coverage",
    description: "Couverture des embeddings RAG",
    critical: false,
    check: async () => {
      const [totalPoliticians, embeddedPoliticians] = await Promise.all([
        db.politician.count({ where: { mandates: { some: { isCurrent: true } } } }),
        db.chatEmbedding.count({ where: { entityType: "POLITICIAN" } }),
      ]);
      const coverage = Math.round((embeddedPoliticians / totalPoliticians) * 100);
      return {
        passed: coverage >= 90,
        count: coverage,
        details: [`${embeddedPoliticians}/${totalPoliticians} politiciens indexés (${coverage}%)`],
      };
    },
  },
];

async function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes("--json");
  const verbose = args.includes("--verbose") || args.includes("-v");

  console.log("\n🔍 Data Quality Tests\n");

  const results: Array<{
    name: string;
    description: string;
    critical: boolean;
    passed: boolean;
    count: number;
    details?: string[];
  }> = [];

  let passed = 0;
  let failed = 0;
  let criticalFailed = 0;

  for (const check of CHECKS) {
    process.stdout.write(`[${check.critical ? "!" : " "}] ${check.name}... `);

    try {
      const result = await check.check();
      results.push({
        name: check.name,
        description: check.description,
        critical: check.critical,
        ...result,
      });

      if (result.passed) {
        passed++;
        console.log(`✅ (${result.count})`);
      } else {
        failed++;
        if (check.critical) criticalFailed++;
        console.log(`❌ (${result.count})${check.critical ? " CRITICAL" : ""}`);
        if (verbose && result.details) {
          for (const detail of result.details.slice(0, 5)) {
            console.log(`   └─ ${detail}`);
          }
        }
      }
    } catch (error) {
      failed++;
      if (check.critical) criticalFailed++;
      console.log(`❌ Error: ${error}`);
      results.push({
        name: check.name,
        description: check.description,
        critical: check.critical,
        passed: false,
        count: -1,
        details: [`Error: ${error}`],
      });
    }
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 Summary\n");
  console.log(`Total checks: ${CHECKS.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (criticalFailed > 0) {
    console.log(`❌ Critical failures: ${criticalFailed}`);
  }

  // JSON output
  if (jsonOutput) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: { total: CHECKS.length, passed, failed, criticalFailed },
      results,
    };
    console.log("\n" + JSON.stringify(report, null, 2));
  }

  // Exit code
  process.exit(criticalFailed > 0 ? 1 : 0);
}

main()
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
