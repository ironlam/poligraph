/**
 * CLI script: Targeted sync by politician or party
 *
 * Orchestrates multiple sync services (enrich, factchecks, press, judilibre)
 * on a specific politician or all members of a party.
 *
 * Usage:
 *   npm run sync:target -- --politician=marine-le-pen
 *   npm run sync:target -- --politician=marine-le-pen --type=factchecks,press
 *   npm run sync:target -- --party=RN
 *   npm run sync:target -- --party=RN --type=judilibre --dry-run
 *   npm run sync:target -- --party=renaissance --type=factchecks --limit=2
 *
 * Types: enrich, factchecks, press, judilibre (default: all)
 */

import "dotenv/config";
import { db } from "../src/lib/db";
import { enrichAffair } from "../src/services/affair-enrichment";
import { syncFactchecks } from "../src/services/sync/factchecks";
import { syncPressAnalysis } from "../src/services/sync/press-analysis";
// syncJudilibre import removed 2026-05-15 (Option C).
// runJudilibre below is now a no-op stub.
import { BRAVE_SEARCH_RATE_LIMIT_MS } from "../src/config/rate-limits";

// ============================================
// CLI ARGUMENTS
// ============================================

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const arg = args.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split("=").slice(1).join("=") : undefined;
}

const politicianSlug = getArg("politician");
const partySlug = getArg("party");
const typeArg = getArg("type");
const limitArg = getArg("limit");

const isDryRun = args.includes("--dry-run");
const isForce = args.includes("--force");
const isVerbose = args.includes("--verbose");
const isHelp = args.includes("--help");

const limit = limitArg ? parseInt(limitArg, 10) : undefined;

const ALL_TYPES = ["enrich", "factchecks", "press", "judilibre"] as const;
type SyncType = (typeof ALL_TYPES)[number];

const requestedTypes: SyncType[] = typeArg
  ? (typeArg.split(",").filter((t) => ALL_TYPES.includes(t as SyncType)) as SyncType[])
  : [...ALL_TYPES];

// ============================================
// HELP
// ============================================

if (isHelp) {
  console.log(`
Poligraph - Sync ciblée par politicien ou parti

Orchestre les syncs (enrich, factchecks, press, judilibre) sur un politicien
spécifique ou tous les membres d'un parti.

Usage:
  npm run sync:target -- --politician=<slug>   Cibler un politicien par slug
  npm run sync:target -- --party=<slug>        Cibler tous les membres d'un parti
  npm run sync:target -- --type=<types>        Types séparés par virgules (défaut: tous)
  npm run sync:target -- --dry-run             Prévisualiser sans écrire
  npm run sync:target -- --force               Ignorer les intervalles minimum
  npm run sync:target -- --limit=N             Limiter (factchecks/press/judilibre)
  npm run sync:target -- --verbose             Affichage détaillé
  npm run sync:target -- --help                Afficher cette aide

Types disponibles: enrich, factchecks, press, judilibre

Exemples:
  npm run sync:target -- --politician=marine-le-pen
  npm run sync:target -- --politician=marine-le-pen --type=factchecks,press
  npm run sync:target -- --party=RN --type=judilibre --dry-run
  npm run sync:target -- --party=renaissance --limit=5
  `);
  process.exit(0);
}

// ============================================
// TYPES & HELPERS
// ============================================

interface PoliticianTarget {
  id: string;
  slug: string;
  fullName: string;
}

interface SyncTypeResult {
  type: SyncType;
  success: boolean;
  stats: Record<string, number>;
  errors: string[];
}

interface PoliticianSyncResult {
  politician: PoliticianTarget;
  results: SyncTypeResult[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// RESOLVE TARGETS
// ============================================

async function resolvePoliticians(): Promise<PoliticianTarget[]> {
  if (!politicianSlug && !partySlug) {
    console.error("Erreur : spécifiez --politician=<slug> ou --party=<slug>");
    process.exit(1);
  }

  if (politicianSlug && partySlug) {
    console.error("Erreur : --politician et --party sont mutuellement exclusifs");
    process.exit(1);
  }

  if (politicianSlug) {
    const politician = await db.politician.findFirst({
      where: { slug: politicianSlug },
      select: { id: true, slug: true, fullName: true },
    });

    if (!politician) {
      console.error(`Erreur : politicien introuvable avec le slug "${politicianSlug}"`);
      process.exit(1);
    }

    return [politician];
  }

  // Party lookup: by slug or shortName (case-insensitive)
  const party = await db.party.findFirst({
    where: {
      OR: [
        { slug: partySlug!.toLowerCase() },
        { shortName: { equals: partySlug!, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, shortName: true },
  });

  if (!party) {
    console.error(`Erreur : parti introuvable avec le slug/shortName "${partySlug}"`);
    process.exit(1);
  }

  // Get all distinct members (current + historical)
  const memberships = await db.partyMembership.findMany({
    where: { partyId: party.id },
    select: {
      politician: { select: { id: true, slug: true, fullName: true } },
    },
    distinct: ["politicianId"],
  });

  const politicians = memberships.map((m) => m.politician);

  if (politicians.length === 0) {
    console.error(`Erreur : aucun membre trouvé pour le parti "${party.name}"`);
    process.exit(1);
  }

  console.log(`Parti ${party.shortName} (${party.name}) — ${politicians.length} membre(s)\n`);

  return politicians;
}

// ============================================
// SYNC RUNNERS
// ============================================

async function runEnrich(politician: PoliticianTarget): Promise<SyncTypeResult> {
  const result: SyncTypeResult = {
    type: "enrich",
    success: true,
    stats: { eligible: 0, enriched: 0, noSource: 0, errors: 0 },
    errors: [],
  };

  // Find affairs that need enrichment:
  // - Few sources (≤2)
  // - OR title starts with [À VÉRIFIER]
  const affairs = await db.affair.findMany({
    where: {
      politicianId: politician.id,
      OR: [{ title: { startsWith: "[À VÉRIFIER]" } }],
    },
    select: {
      id: true,
      title: true,
      _count: { select: { sources: true } },
    },
  });

  // Also include affairs with ≤2 sources
  const affairsWithFewSources = await db.affair.findMany({
    where: {
      politicianId: politician.id,
      title: { not: { startsWith: "[À VÉRIFIER]" } },
    },
    select: {
      id: true,
      title: true,
      _count: { select: { sources: true } },
    },
  });

  const eligible = [...affairs, ...affairsWithFewSources.filter((a) => a._count.sources <= 2)];

  result.stats.eligible = eligible.length;

  if (eligible.length === 0) {
    if (isVerbose) console.log("    Aucune affaire éligible à l'enrichissement");
    return result;
  }

  if (isVerbose) {
    console.log(`    ${eligible.length} affaire(s) éligible(s)`);
  }

  for (let i = 0; i < eligible.length; i++) {
    const affair = eligible[i];

    if (isDryRun) {
      console.log(`    [DRY-RUN] "${affair!.title}"`);
      continue;
    }

    try {
      const enrichResult = await enrichAffair(affair!.id);

      if (enrichResult.enriched) {
        result.stats.enriched!++;
        if (isVerbose) {
          console.log(
            `    ✓ "${affair!.title}" — ${enrichResult.sourcesAdded} source(s) ajoutée(s)`
          );
        }
      } else {
        result.stats.noSource!++;
        if (isVerbose) {
          console.log(`    - "${affair!.title}" — pas de source trouvée`);
        }
      }

      // Rate limit between Brave Search calls
      if (i < eligible.length - 1) {
        await sleep(BRAVE_SEARCH_RATE_LIMIT_MS);
      }
    } catch (error) {
      result.stats.errors!++;
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`enrich "${affair!.title}": ${msg}`);
      if (isVerbose) console.error(`    ✗ "${affair!.title}" — ${msg}`);
    }
  }

  result.success = result.stats.errors === 0;
  return result;
}

async function runFactchecks(politician: PoliticianTarget): Promise<SyncTypeResult> {
  try {
    const stats = await syncFactchecks({
      politician: politician.fullName,
      force: isForce,
      dryRun: isDryRun,
      limit,
    });

    return {
      type: "factchecks",
      success: stats.errors.length === 0,
      stats: {
        claimsFound: stats.claimsFound,
        factChecksCreated: stats.factChecksCreated,
        factChecksSkipped: stats.factChecksSkipped,
        mentionsCreated: stats.mentionsCreated,
      },
      errors: stats.errors,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      type: "factchecks",
      success: false,
      stats: {},
      errors: [msg],
    };
  }
}

async function runPress(politician: PoliticianTarget): Promise<SyncTypeResult> {
  try {
    const stats = await syncPressAnalysis({
      politicianSlug: politician.slug,
      force: isForce,
      dryRun: isDryRun,
      limit,
      verbose: isVerbose,
    });

    return {
      type: "press",
      success: stats.analysisErrors === 0,
      stats: {
        articlesProcessed: stats.articlesProcessed,
        articlesAnalyzed: stats.articlesAnalyzed,
        affairsEnriched: stats.affairsEnriched,
        affairsCreated: stats.affairsCreated,
      },
      errors: [],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      type: "press",
      success: false,
      stats: {},
      errors: [msg],
    };
  }
}

async function runJudilibre(_politician: PoliticianTarget): Promise<SyncTypeResult> {
  // Judilibre pipeline disabled 2026-05-15 (Option C).
  // The Cassation chambre criminelle corpus is structurally anonymized;
  // pipeline produced 0 affairs over 156 decisions. Re-enabling tracked
  // as Option D (enrichment for existing affairs) in follow-up issue.
  return {
    type: "judilibre",
    success: true,
    stats: {},
    errors: [
      "Pipeline désactivé 2026-05-15 (Option C) : corpus anonymisé, aucune affaire produite.",
    ],
  };
}

const SYNC_RUNNERS: Record<SyncType, (p: PoliticianTarget) => Promise<SyncTypeResult>> = {
  enrich: runEnrich,
  factchecks: runFactchecks,
  press: runPress,
  judilibre: runJudilibre,
};

// ============================================
// MAIN
// ============================================

async function main() {
  const startTime = Date.now();

  console.log("=".repeat(60));
  console.log("Poligraph - Sync ciblée");
  console.log("=".repeat(60));

  if (isDryRun) console.log("[MODE DRY-RUN] Aucune écriture en base\n");

  const invalidTypes = typeArg
    ? typeArg.split(",").filter((t) => !ALL_TYPES.includes(t as SyncType))
    : [];
  if (invalidTypes.length > 0) {
    console.error(
      `Erreur : type(s) inconnu(s) : ${invalidTypes.join(", ")}. Valides : ${ALL_TYPES.join(", ")}`
    );
    process.exit(1);
  }

  console.log(`Types : ${requestedTypes.join(", ")}`);
  if (limit) console.log(`Limite : ${limit}`);
  console.log();

  const politicians = await resolvePoliticians();
  const allResults: PoliticianSyncResult[] = [];

  for (let pi = 0; pi < politicians.length; pi++) {
    const politician = politicians[pi];

    console.log("-".repeat(60));
    console.log(`[${pi + 1}/${politicians.length}] ${politician!.fullName} (${politician!.slug})`);
    console.log("-".repeat(60));

    const politicianResult: PoliticianSyncResult = { politician: politician!, results: [] };

    for (const type of requestedTypes) {
      console.log(`\n  ${type.toUpperCase()}`);

      const runner = SYNC_RUNNERS[type];
      const result = await runner(politician!);
      politicianResult.results.push(result);

      // Display inline stats
      const statsStr = Object.entries(result.stats)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      const statusIcon = result.success ? "OK" : "ERREUR";
      console.log(`    [${statusIcon}] ${statsStr || "terminé"}`);

      if (result.errors.length > 0) {
        for (const err of result.errors.slice(0, 3)) {
          console.log(`    ! ${err}`);
        }
        if (result.errors.length > 3) {
          console.log(`    ... et ${result.errors.length - 3} autre(s) erreur(s)`);
        }
      }
    }

    allResults.push(politicianResult);
  }

  // ============================================
  // SUMMARY
  // ============================================

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n" + "=".repeat(60));
  console.log("RÉSUMÉ");
  console.log("=".repeat(60));
  console.log(`Politiciens traités : ${allResults.length}`);
  console.log(`Durée : ${duration}s`);

  // Aggregate stats by type
  for (const type of requestedTypes) {
    const typeResults = allResults.flatMap((r) => r.results.filter((tr) => tr.type === type));
    const aggregated: Record<string, number> = {};
    let errorCount = 0;

    for (const tr of typeResults) {
      for (const [k, v] of Object.entries(tr.stats)) {
        aggregated[k] = (aggregated[k] || 0) + v;
      }
      errorCount += tr.errors.length;
    }

    const statsStr = Object.entries(aggregated)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    const status = errorCount === 0 ? "OK" : `${errorCount} erreur(s)`;
    console.log(`\n  ${type.toUpperCase()} [${status}]`);
    if (statsStr) console.log(`    ${statsStr}`);
  }

  // Exit code
  const hasErrors = allResults.some((r) => r.results.some((tr) => !tr.success));
  if (hasErrors) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("Erreur fatale:", err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
