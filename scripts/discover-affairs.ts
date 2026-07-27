/**
 * CLI script to discover historical judicial affairs from Wikidata and Wikipedia
 *
 * Phase 1: Wikidata — Checks P1399 (convicted of) and P1595 (charge) claims
 * Phase 2: Wikipedia — Finds judicial sections and extracts affairs via AI
 * Phase 3: Reconciliation — Deduplicates and persists to database
 *
 * Usage:
 *   npm run discover:affairs                          # Full discovery
 *   npm run discover:affairs -- --stats               # Show current stats
 *   npm run discover:affairs -- --dry-run             # Preview without saving
 *   npm run discover:affairs -- --limit=10            # Limit to N politicians
 *   npm run discover:affairs -- --politician="Sarkozy"  # Filter by name
 *   npm run discover:affairs -- --wikidata-only       # Phase 1 only
 *   npm run discover:affairs -- --wikipedia-only      # Phase 2 only
 */

import "dotenv/config";
import { createCLI, ProgressTracker, type SyncHandler, type SyncResult } from "../src/lib/sync";
import { db } from "../src/lib/db";
import { generateSlug } from "../src/lib/utils";
import { WikidataService } from "../src/lib/api/wikidata";
import { WD_PROPS } from "../src/config/wikidata";
import { mapWikidataOffense, getOffenseLabel } from "../src/config/wikidata-affairs";
import { wikipediaService } from "../src/lib/api/wikipedia";
import { extractAffairsFromWikipedia } from "../src/services/wikipedia-affair-extraction";
import { findMatchingAffairs } from "../src/services/affairs/matching";
import { createDraftAffairFromDiscovery } from "../src/services/affairs/create-draft";
import { clampConfidenceScore } from "../src/services/affairs/confidence";
import { extractDateFromUrl } from "../src/lib/extract-date-from-url";
import {
  getDiscoverAffairsCursor,
  saveDiscoverAffairsCursor,
} from "../src/services/sync/discover-affairs";
import type { AffairCategory, AffairStatus, Involvement } from "../src/generated/prisma";

// ============================================
// TYPES
// ============================================

interface DiscoveredAffair {
  politicianId: string;
  politicianName: string;
  title: string;
  description: string;
  category: AffairCategory;
  status: AffairStatus;
  involvement: Involvement;
  factsDate: Date | null;
  court: string | null;
  charges: string[];
  confidenceScore: number;
  sources: Array<{
    url: string;
    title: string;
    publisher: string;
    sourceType: "WIKIDATA" | "WIKIPEDIA" | "PRESSE";
    publishedAt: Date | null;
  }>;
  phase: "wikidata" | "wikipedia";
}

interface DiscoveryStats {
  politiciansProcessed: number;
  politiciansWithQid: number;
  politiciansWithWikipedia: number;
  wikidataAffairsFound: number;
  wikipediaSectionsFound: number;
  wikipediaAiCalls: number;
  wikipediaAffairsFound: number;
  duplicatesSkipped: number;
  affairsCreated: number;
  /** Toujours égal à affairsCreated : un importeur ne crée que des brouillons. */
  affairsDraft: number;
  errors: number;
}

// ============================================
// HELPERS
// ============================================

function extractPublisherFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    const PUBLISHER_MAP: Record<string, string> = {
      "lemonde.fr": "Le Monde",
      "liberation.fr": "Libération",
      "mediapart.fr": "Mediapart",
      "lefigaro.fr": "Le Figaro",
      "francetvinfo.fr": "France Info",
      "bfmtv.com": "BFM TV",
      "leparisien.fr": "Le Parisien",
      "20minutes.fr": "20 Minutes",
      "lexpress.fr": "L'Express",
      "lepoint.fr": "Le Point",
      "nouvelobs.com": "L'Obs",
      "europe1.fr": "Europe 1",
      "rtl.fr": "RTL",
      "rfi.fr": "RFI",
    };
    return PUBLISHER_MAP[hostname] || hostname;
  } catch {
    return "Source inconnue";
  }
}

// ============================================
// PHASE 1: WIKIDATA
// ============================================

async function runPhase1Wikidata(
  politicians: Array<{
    id: string;
    fullName: string;
    externalIds: Array<{ externalId: string }>;
  }>,
  stats: DiscoveryStats,
  verbose: boolean
): Promise<DiscoveredAffair[]> {
  const discovered: DiscoveredAffair[] = [];
  const wikidataService = new WikidataService();

  // Filter politicians with Wikidata Q-IDs
  const withQid = politicians.filter((p) => p.externalIds.length > 0);
  stats.politiciansWithQid = withQid.length;

  if (withQid.length === 0) {
    console.log("\n  Phase 1: Aucun politicien avec Q-ID Wikidata trouvé.");
    return discovered;
  }

  console.log(`\n  Phase 1: Wikidata — ${withQid.length} politiciens avec Q-ID`);
  const progress = new ProgressTracker({ total: withQid.length, label: "Phase 1 — Wikidata" });

  for (const politician of withQid) {
    const qid = politician.externalIds[0]!.externalId;

    try {
      const entities = await wikidataService.getEntities([qid]);
      const entity = entities.get(qid);

      if (!entity) {
        progress.tick();
        continue;
      }

      // Check P1399 (convicted of) and P1595 (charge)
      const properties: Array<{ prop: "P1399" | "P1595"; claims: (typeof entity.claims)[string] }> =
        [
          { prop: "P1399", claims: entity.claims[WD_PROPS.CONVICTED_OF] },
          { prop: "P1595", claims: entity.claims[WD_PROPS.CHARGE] },
        ];

      for (const { prop, claims } of properties) {
        if (!claims) continue;

        for (const claim of claims) {
          const value = claim.mainsnak?.datavalue?.value;
          if (!value || typeof value !== "object" || !("id" in value)) continue;

          const offenseQid = value.id;
          const { category, status } = mapWikidataOffense(offenseQid, prop);
          const label = getOffenseLabel(offenseQid);

          // Le score sert à prioriser la revue humaine, pas à décider d'une
          // mise en ligne : toute affaire découverte reste un brouillon.
          const isConviction = prop === "P1399";
          const confidence = isConviction ? 95 : 75;
          const titlePrefix = isConviction ? "" : "[À VÉRIFIER] ";
          const title = `${titlePrefix}${label} — ${politician.fullName}`;

          discovered.push({
            politicianId: politician.id,
            politicianName: politician.fullName,
            title,
            description: `${label} (${isConviction ? "condamnation" : "mise en cause"}) — source Wikidata (${qid}, propriété ${prop}).`,
            category,
            status,
            involvement: isConviction ? "DIRECT" : "MENTIONED_ONLY",
            factsDate: null,
            court: null,
            charges: [label],
            confidenceScore: clampConfidenceScore(confidence),
            sources: [
              {
                url: `https://www.wikidata.org/wiki/${qid}`,
                title: `Wikidata — ${politician.fullName}`,
                publisher: "Wikidata",
                sourceType: "WIKIDATA",
                publishedAt: null,
              },
            ],
            phase: "wikidata",
          });

          stats.wikidataAffairsFound++;

          if (verbose) {
            console.log(
              `    [WD] ${politician.fullName}: ${label} (${prop}, ${category}, ${status})`
            );
          }
        }
      }
    } catch (error) {
      stats.errors++;
      console.error(
        `    [WD] Erreur pour ${politician.fullName} (${qid}):`,
        error instanceof Error ? error.message : error
      );
    }

    progress.tick();
  }

  progress.finish();
  return discovered;
}

// ============================================
// PHASE 2: WIKIPEDIA
// ============================================

async function runPhase2Wikipedia(
  politicians: Array<{
    id: string;
    fullName: string;
    externalIds: Array<{ externalId: string }>;
  }>,
  phase1Affairs: DiscoveredAffair[],
  stats: DiscoveryStats,
  verbose: boolean
): Promise<DiscoveredAffair[]> {
  const discovered: DiscoveredAffair[] = [];

  console.log(`\n  Phase 2: Wikipedia — ${politicians.length} politiciens`);
  const progress = new ProgressTracker({ total: politicians.length, label: "Phase 2 — Wikipedia" });

  // Build a set of (politicianId, category) from Phase 1 for cross-phase dedup
  const phase1Keys = new Set(phase1Affairs.map((a) => `${a.politicianId}:${a.category}`));

  for (const politician of politicians) {
    try {
      const sections = await wikipediaService.findJudicialSections(politician.fullName);

      if (sections.length === 0) {
        progress.tick();
        continue;
      }

      stats.politiciansWithWikipedia++;
      stats.wikipediaSectionsFound += sections.length;

      if (verbose) {
        console.log(`    [WP] ${politician.fullName}: ${sections.length} section(s) judiciaire(s)`);
      }

      for (const section of sections) {
        stats.wikipediaAiCalls++;
        const pageUrl = `https://fr.wikipedia.org/wiki/${encodeURIComponent(politician.fullName.replace(/ /g, "_"))}`;

        const result = await extractAffairsFromWikipedia({
          politicianName: politician.fullName,
          sectionTitle: section.title,
          wikitext: section.wikitext,
          pageUrl,
        });

        for (const extracted of result.affairs) {
          // Skip affairs where the politician has no significant role
          // Keep DIRECT (accused/convicted), VICTIM (threatened/attacked), PLAINTIFF (filed complaint)
          if (
            extracted.involvement !== "DIRECT" &&
            extracted.involvement !== "VICTIM" &&
            extracted.involvement !== "PLAINTIFF"
          ) {
            if (verbose) {
              console.log(
                `    [WP] Skip (${extracted.involvement}, pas mis en cause/victime): ${extracted.title}`
              );
            }
            continue;
          }

          // Skip low confidence
          if (extracted.confidenceScore < 40) {
            if (verbose) {
              console.log(
                `    [WP] Skip (confiance ${extracted.confidenceScore} < 40): ${extracted.title}`
              );
            }
            continue;
          }

          // Cross-phase dedup: skip if same politician+category found in Phase 1
          const dedupKey = `${politician.id}:${extracted.category}`;
          if (phase1Keys.has(dedupKey)) {
            if (verbose) {
              console.log(
                `    [WP] Skip (déjà trouvé en Phase 1): ${extracted.title} (${extracted.category})`
              );
            }
            continue;
          }

          // Build sources array: Wikipedia + press URLs
          const sources: DiscoveredAffair["sources"] = [
            {
              url: pageUrl,
              title: `Wikipedia — ${politician.fullName}`,
              publisher: "Wikipedia",
              sourceType: "WIKIPEDIA",
              publishedAt: null,
            },
          ];

          for (const sourceUrl of extracted.sourceUrls) {
            sources.push({
              url: sourceUrl,
              title: extracted.title,
              publisher: extractPublisherFromUrl(sourceUrl),
              sourceType: "PRESSE",
              publishedAt: extractDateFromUrl(sourceUrl),
            });
          }

          discovered.push({
            politicianId: politician.id,
            politicianName: politician.fullName,
            title: `[À VÉRIFIER] ${extracted.title}`,
            description: extracted.description,
            category: extracted.category as AffairCategory,
            status: extracted.status as AffairStatus,
            involvement: extracted.involvement,
            factsDate: extracted.factsDate ? new Date(extracted.factsDate) : null,
            court: extracted.court,
            charges: extracted.charges,
            confidenceScore: clampConfidenceScore(extracted.confidenceScore),
            sources,
            phase: "wikipedia",
          });

          stats.wikipediaAffairsFound++;

          if (verbose) {
            console.log(
              `    [WP] ${politician.fullName}: ${extracted.title} (${extracted.category}, confiance ${extracted.confidenceScore})`
            );
          }
        }
      }
    } catch (error) {
      stats.errors++;
      console.error(
        `    [WP] Erreur pour ${politician.fullName}:`,
        error instanceof Error ? error.message : error
      );
    }

    progress.tick();
  }

  progress.finish();
  return discovered;
}

// ============================================
// PHASE 3: RECONCILIATION + PERSISTENCE
// ============================================

async function runPhase3Reconciliation(
  allAffairs: DiscoveredAffair[],
  stats: DiscoveryStats,
  dryRun: boolean,
  verbose: boolean
): Promise<void> {
  console.log(`\n  Phase 3: Réconciliation — ${allAffairs.length} affaires à traiter`);
  const progress = new ProgressTracker({
    total: allAffairs.length,
    label: "Phase 3 — Réconciliation",
  });

  for (const affair of allAffairs) {
    try {
      // Check for duplicates
      const matches = await findMatchingAffairs({
        politicianId: affair.politicianId,
        title: affair.title,
        category: affair.category,
      });

      const highMatch = matches.find((m) => m.confidence === "HIGH" || m.confidence === "CERTAIN");

      if (highMatch) {
        stats.duplicatesSkipped++;
        if (verbose) {
          console.log(
            `    [SKIP] Doublon détecté (${highMatch.confidence}, ${highMatch.matchedBy}): ${affair.title}`
          );
        }
        progress.tick();
        continue;
      }

      if (dryRun) {
        console.log(`    [DRY] Créerait (DRAFT): ${affair.title} (${affair.category})`);
        stats.affairsCreated++;
        stats.affairsDraft++;
        progress.tick();
        continue;
      }

      // Sas unique de création côté importeur : force DRAFT et verifiedAt
      // null. La mise en ligne relève ensuite d'assertPublishable().
      await createDraftAffairFromDiscovery({
        politicianId: affair.politicianId,
        title: affair.title,
        baseSlug: generateSlug(affair.title),
        description: affair.description,
        status: affair.status,
        category: affair.category,
        involvement: affair.involvement,
        confidenceScore: affair.confidenceScore,
        factsDate: affair.factsDate,
        court: affair.court,
        sources: affair.sources.map((s) => ({
          url: s.url,
          title: s.title,
          publisher: s.publisher,
          publishedAt: s.publishedAt ?? affair.factsDate ?? new Date(),
          sourceType: s.sourceType,
        })),
      });

      stats.affairsCreated++;
      stats.affairsDraft++;

      if (verbose) {
        console.log(`    [OK] Créé (DRAFT): ${affair.title} (${affair.category})`);
      }
    } catch (error) {
      stats.errors++;
      console.error(
        `    [ERR] Erreur création pour "${affair.title}":`,
        error instanceof Error ? error.message : error
      );
    }

    progress.tick();
  }

  progress.finish();
}

// ============================================
// SYNC HANDLER
// ============================================

const handler: SyncHandler = {
  name: "Poligraph — Découverte d'affaires (Wikidata + Wikipedia)",
  description:
    "Découvre les affaires judiciaires historiques via Wikidata (P1399/P1595) et Wikipedia (sections judiciaires + IA)",

  options: [
    {
      name: "--politician",
      type: "string",
      description: "Filtrer par nom de politicien (correspondance partielle)",
    },
    {
      name: "--wikidata-only",
      type: "boolean",
      description: "Exécuter Phase 1 (Wikidata) uniquement",
    },
    {
      name: "--wikipedia-only",
      type: "boolean",
      description: "Exécuter Phase 2 (Wikipedia) uniquement",
    },
  ],

  showHelp() {
    console.log(`
Poligraph — Découverte d'affaires judiciaires (Wikidata + Wikipedia)

Découvre automatiquement les affaires judiciaires historiques pour les
politiciens enregistrés dans la base de données.

Phases :
  1. Wikidata   — Vérifie P1399 (condamné pour) et P1595 (accusé de)
                   pour chaque politicien avec un Q-ID Wikidata
  2. Wikipedia  — Cherche les sections judiciaires sur la page Wikipedia
                   et extrait les affaires via Claude (IA)
  3. Réconciliation — Déduplique avec les affaires existantes et persiste

Options :
  --stats              Afficher les statistiques actuelles
  --dry-run            Prévisualiser sans sauvegarder
  --limit=N            Limiter à N politiciens
  --politician="Nom"   Filtrer par nom de politicien
  --wikidata-only      Phase 1 uniquement (Wikidata)
  --wikipedia-only     Phase 2 uniquement (Wikipedia)
  --force              Forcer (bypass incrémental)
  --verbose            Sortie détaillée
  --help               Afficher cette aide

Environnement :
  ANTHROPIC_API_KEY    Requis pour Phase 2 (extraction IA Wikipedia)
    `);
  },

  async showStats() {
    const [totalPublished, withAffairs, withQid, totalAffairs, publishedAffairs, draftAffairs] =
      await Promise.all([
        db.politician.count({ where: { publicationStatus: "PUBLISHED" } }),
        db.politician.count({
          where: {
            publicationStatus: "PUBLISHED",
            affairs: { some: {} },
          },
        }),
        db.politician.count({
          where: {
            publicationStatus: "PUBLISHED",
            externalIds: { some: { source: "WIKIDATA" } },
          },
        }),
        db.affair.count(),
        db.affair.count({ where: { publicationStatus: "PUBLISHED" } }),
        db.affair.count({ where: { publicationStatus: "DRAFT" } }),
      ]);

    console.log("\n=== Statistiques Découverte d'affaires ===\n");
    console.log(`  Politiciens publiés :            ${totalPublished}`);
    console.log(`  Politiciens avec ≥1 affaire :    ${withAffairs}`);
    console.log(`  Politiciens avec Q-ID Wikidata : ${withQid}`);
    console.log(`  Total affaires :                 ${totalAffairs}`);
    console.log(`    — Publiées :                   ${publishedAffairs}`);
    console.log(`    — Brouillons :                 ${draftAffairs}`);
    console.log("");
  },

  async sync(options): Promise<SyncResult> {
    const startTime = Date.now();
    const dryRun = !!options.dryRun;
    const verbose = !!options.verbose;
    const wikidataOnly = !!options.wikidataOnly;
    const wikipediaOnly = !!options.wikipediaOnly;
    const politicianFilter = options.politician as string | undefined;

    const stats: DiscoveryStats = {
      politiciansProcessed: 0,
      politiciansWithQid: 0,
      politiciansWithWikipedia: 0,
      wikidataAffairsFound: 0,
      wikipediaSectionsFound: 0,
      wikipediaAiCalls: 0,
      wikipediaAffairsFound: 0,
      duplicatesSkipped: 0,
      affairsCreated: 0,
      affairsDraft: 0,
      errors: 0,
    };

    // Apply the persisted lastName cursor only on bounded runs without a name filter.
    // Full backfills (no --limit) and targeted runs (--politician) bypass the cursor.
    const limit = options.limit as number | undefined;
    const cursorActive = !politicianFilter && typeof limit === "number" && limit > 0;
    const cursorState = cursorActive ? await getDiscoverAffairsCursor() : { lastName: null };
    const cursor = cursorState.lastName;

    // Fetch politicians. Empty-string lastNames are filtered out via gt: "" when no
    // cursor is set so we always have a meaningful sort key.
    const politicians = await db.politician.findMany({
      where: {
        publicationStatus: "PUBLISHED",
        lastName: { gt: cursor ?? "" },
        ...(politicianFilter
          ? { fullName: { contains: politicianFilter, mode: "insensitive" as const } }
          : {}),
      },
      select: {
        id: true,
        fullName: true,
        lastName: true,
        externalIds: {
          where: { source: "WIKIDATA" },
          select: { externalId: true },
        },
      },
      orderBy: { lastName: "asc" },
      ...(limit ? { take: limit } : {}),
    });

    stats.politiciansProcessed = politicians.length;
    console.log(`\n  ${politicians.length} politicien(s) trouvé(s)`);

    if (cursorActive) {
      if (politicians.length === 0 || (typeof limit === "number" && politicians.length < limit)) {
        console.log(
          `[discover-affairs] cursor: ${cursor ?? "(start)"} -> (end), processed ${politicians.length}; alphabet exhausted, cursor reset`
        );
        await saveDiscoverAffairsCursor(null);
      } else {
        const lastSeen = politicians[politicians.length - 1]!.lastName ?? null;
        console.log(
          `[discover-affairs] cursor: ${cursor ?? "(start)"} -> ${lastSeen ?? "(end)"}, processed ${politicians.length}`
        );
        await saveDiscoverAffairsCursor(lastSeen);
      }
    }

    if (politicians.length === 0) {
      return {
        success: true,
        duration: (Date.now() - startTime) / 1000,
        stats: stats as unknown as Record<string, number>,
        errors: [],
      };
    }

    // Phase 1: Wikidata
    let phase1Affairs: DiscoveredAffair[] = [];
    if (!wikipediaOnly) {
      phase1Affairs = await runPhase1Wikidata(politicians, stats, verbose);
    }

    // Phase 2: Wikipedia
    let phase2Affairs: DiscoveredAffair[] = [];
    if (!wikidataOnly) {
      phase2Affairs = await runPhase2Wikipedia(politicians, phase1Affairs, stats, verbose);
    }

    // Phase 3: Reconciliation + Persistence
    const allAffairs = [...phase1Affairs, ...phase2Affairs];

    if (allAffairs.length > 0) {
      await runPhase3Reconciliation(allAffairs, stats, dryRun, verbose);
    } else {
      console.log("\n  Phase 3: Aucune affaire découverte — rien à réconcilier.");
    }

    // Summary
    console.log("\n  === Résumé ===");
    console.log(`  Politiciens traités :       ${stats.politiciansProcessed}`);
    console.log(`  Politiciens avec Q-ID :     ${stats.politiciansWithQid}`);
    console.log(`  Wikidata — affaires :       ${stats.wikidataAffairsFound}`);
    console.log(`  Wikipedia — sections :      ${stats.wikipediaSectionsFound}`);
    console.log(`  Wikipedia — appels IA :     ${stats.wikipediaAiCalls}`);
    console.log(`  Wikipedia — affaires :      ${stats.wikipediaAffairsFound}`);
    console.log(`  Doublons ignorés :          ${stats.duplicatesSkipped}`);
    console.log(`  Affaires créées :           ${stats.affairsCreated}`);
    console.log(`    — Brouillons (toutes) :   ${stats.affairsDraft}`);
    console.log(`  Erreurs :                   ${stats.errors}`);

    return {
      success: stats.errors === 0,
      duration: (Date.now() - startTime) / 1000,
      stats: stats as unknown as Record<string, number>,
      errors: [],
    };
  },
};

// ============================================
// RUN
// ============================================

createCLI(handler);
