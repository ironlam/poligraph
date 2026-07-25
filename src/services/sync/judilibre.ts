/**
 * [DISABLED 2026-05-15, Option C]
 *
 * This pipeline is deprecated. Audit:
 *   docs/superpowers/audits/2026-05-15-judilibre-no-match-audit.md
 *
 * The Cassation chambre criminelle corpus we currently fetch is
 * structurally anonymized doctrine; the resolver correctly produces
 * 0 SAME matches because the text contains no named individuals.
 *
 * The Inngest cron registration was removed from `src/inngest/index.ts`.
 * The CLI `scripts/sync-judilibre.ts` is kept for manual debugging but
 * prints a deprecation warning at start.
 *
 * Reorientation (Option D, enrichment of existing affairs with
 * procedural details from Cassation references) is tracked in a
 * follow-up GitHub issue. Do not re-enable this pipeline without
 * implementing that reorientation.
 */

/**
 * Judilibre Sync Service
 *
 * Searches Cour de cassation criminal decisions for politicians:
 * - Signal-based resolver (affair-matching) for politician identification
 * - IdentityDecision persistence (blocklist, admin review, short-circuit)
 * - Enriches existing affairs with ECLI/pourvoi identifiers
 * - Creates new affairs for confirmed convictions
 */

import { db } from "@/lib/db";
import { AffairStatus, DataSource } from "@/generated/prisma";
import { generateSlug } from "@/lib/utils";
import {
  JudilibreClient,
  createJudilibreClient,
  type JudilibreDecisionSummary,
} from "@/lib/api/judilibre";
import { findMatchingAffairs } from "@/services/affairs/matching";
import {
  mapSolutionToStatus,
  mapJudilibreToCategory,
  analyzeIfConviction,
  buildTitleFromDecision,
} from "@/services/affairs/judilibre-mapping";
import { syncMetadata } from "@/lib/sync";
import { findCourtDepartments, extractJurisdictionName } from "@/config/judilibre-courts";
import { resolveAffairPolitician } from "@/lib/affair-matching";
import { loadJudilibreDecisionCache } from "./judilibre-decisions";
import { proposeAffairUpdate } from "@/services/affairs/proposals";
import {
  failImportRun,
  finishImportRun,
  IMPORTER_JUDILIBRE,
  startImportRun,
} from "@/services/affairs/import-run";

/**
 * Bump when the Judilibre mapping changes shape or semantics. Part of the
 * proposal payload hash.
 */
export const JUDILIBRE_EXTRACTOR_VERSION = "judilibre-v1";

// ============================================
// TYPES
// ============================================

export interface JudilibreSyncOptions {
  dryRun?: boolean;
  force?: boolean;
  limit?: number;
  politicianSlug?: string;
  verbose?: boolean;
}

export interface JudilibreSyncStats {
  politiciansSearched: number;
  decisionsFound: number;
  decisionsRelevant: number;
  affairsEnriched: number;
  affairsCreated: number;
  decisionsSkipped: number;
  decisionsBlocked: number;
  decisionsUndecided: number;
  decisionsShortCircuited: number;
  errors: number;
}

interface PoliticianForSearch {
  id: string;
  fullName: string;
  slug: string;
  birthDate: Date | null;
  hasAffairs: boolean;
  /** Departments from mandates, for cross-checking identity against court jurisdictions */
  departments: string[];
}

// ============================================
// CONSTANTS
// ============================================

const SYNC_SOURCE_KEY = "judilibre";
const MIN_SYNC_INTERVAL_MS = 8 * 60 * 60 * 1000; // 8 hours (daily sync runs 3x/day)
const MIN_AGE_AT_DECISION = 18; // Skip if politician was < 18 at time of decision

// ============================================
// SEARCH
// ============================================

/**
 * Search Judilibre for a politician's criminal decisions
 */
async function searchPoliticianDecisions(
  client: JudilibreClient,
  politician: PoliticianForSearch,
  verbose?: boolean
): Promise<JudilibreDecisionSummary[]> {
  const results = await client.searchDecisions(politician.fullName, {
    chamber: "cr", // Criminelle uniquement
    page_size: 25,
  });

  if (verbose && results.total > 0) {
    console.log(`  ${results.total} décision(s) trouvée(s) pour ${politician.fullName}`);
  }

  return results.results;
}

// ============================================
// ENRICHMENT & CREATION
// ============================================

/**
 * Enrich an existing affair with Judilibre data (ECLI, pourvoi, source).
 *
 * Affaires v2, lot 1: no direct write. Judicial identifiers are auto-applied only
 * when absent and non-contradictory (proposeAffairUpdate enforces that, including
 * the Affair.ecli unique collision that used to raise P2002). A status change is
 * always filed as a proposal, and the timeline event moves to acceptance time.
 */
async function enrichAffairFromJudilibre(
  affairId: string,
  decision: JudilibreDecisionSummary,
  dryRun: boolean,
  verbose?: boolean,
  importRunId?: string | null
): Promise<boolean> {
  if (dryRun) {
    if (verbose) {
      console.log(`  [DRY-RUN] Proposerait sur l'affaire ${affairId} l'ECLI ${decision.ecli}`);
    }
    return true;
  }

  const decisionUrl = `https://www.courdecassation.fr/decision/${decision.id}`;

  try {
    const patch: Record<string, unknown> = {};

    if (decision.ecli) {
      patch.ecli = decision.ecli;
    }
    if (decision.number) {
      patch.pourvoiNumber = decision.number;
    }
    if (decision.numbers && decision.numbers.length > 0) {
      // proposeAffairUpdate merges additively with the stored array.
      patch.caseNumbers = decision.numbers;
    }

    // Map solution to status (upgrade or terminal transition). The monotonic
    // guard stays here so we do not file proposals for regressions a reviewer
    // would only reject.
    const newStatus = mapSolutionToStatus(decision.solution);
    const currentAffair = await db.affair.findUnique({
      where: { id: affairId },
      select: { status: true },
    });
    if (currentAffair && shouldUpdateStatus(currentAffair.status, newStatus)) {
      patch.status = newStatus;
    }

    if (Object.keys(patch).length > 0) {
      await proposeAffairUpdate({
        affairId,
        importer: IMPORTER_JUDILIBRE,
        importRunId: importRunId ?? null,
        patch,
        source: "JUDILIBRE",
        sourceUrl: decisionUrl,
        officialId: decision.ecli ?? decision.number ?? null,
        sourceExcerpt: decision.summary?.slice(0, 500) ?? null,
        metadata: { solution: decision.solution, decisionId: decision.id },
        confidence: 90,
        rationale:
          `Décision Cour de cassation ${decision.number ?? "(sans n°)"} ` +
          `(${decision.solution}) rapprochée de cette affaire. ` +
          `Identifiants judiciaires et, le cas échéant, progression du statut.`,
        extractorVersion: JUDILIBRE_EXTRACTOR_VERSION,
      });
    }

    // Add Judilibre source if not already present
    const existingSource = await db.source.findFirst({
      where: {
        affairId,
        sourceType: "JUDILIBRE",
      },
    });

    if (!existingSource) {
      await db.source.create({
        data: {
          affairId,
          url: `https://www.courdecassation.fr/decision/${decision.id}`,
          title: `Cour de cassation - ${decision.solution} (${decision.number})`,
          publisher: "Cour de cassation",
          publishedAt: new Date(decision.decision_date),
          sourceType: "JUDILIBRE",
        },
      });
    }

    if (verbose) {
      console.log(`  ✓ Affaire ${affairId} enrichie avec ECLI ${decision.ecli}`);
    }

    return true;
  } catch (error) {
    console.error(`  ✗ Erreur enrichissement affaire ${affairId}:`, error);
    return false;
  }
}

/**
 * Create a new affair from a Judilibre decision.
 *
 * publicationStatus is DRAFT until editorial validation. The title is built
 * directly from the decision metadata (no marker prefix) — the DRAFT status
 * is the single source of truth for unvalidated content.
 */
async function createAffairFromJudilibre(
  politicianId: string,
  decision: JudilibreDecisionSummary,
  politicianDepartments: string[],
  dryRun: boolean,
  verbose?: boolean
): Promise<boolean> {
  const title = buildTitleFromDecision(decision);
  const category = mapJudilibreToCategory(decision.themes, decision.summary);
  const status = mapSolutionToStatus(decision.solution);

  // Cross-check jurisdiction against politician's departments
  const jurisdictionCheck = checkJurisdictionMatch(decision.summary || "", politicianDepartments);

  // If jurisdiction mismatch, reduce effective confidence
  const confidenceScore =
    jurisdictionCheck.match === false ? Math.max(0, 50 - JURISDICTION_MISMATCH_PENALTY) : undefined;
  if (jurisdictionCheck.match === false && verbose) {
    console.log(
      `  ⚠ Juridiction mismatch: ${jurisdictionCheck.jurisdiction} vs départements [${politicianDepartments.join(", ")}] → confiance réduite`
    );
  }

  if (dryRun) {
    console.log(`  [DRY-RUN] Créerait affaire: ${title} (${decision.ecli})`);
    return true;
  }

  try {
    const baseSlug = generateSlug(title);
    let slug = baseSlug;

    // Ensure unique slug
    let counter = 1;
    while (await db.affair.findUnique({ where: { slug }, select: { id: true } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    await db.affair.create({
      data: {
        politicianId,
        title,
        slug,
        description: decision.summary || `Décision de la Cour de cassation : ${decision.solution}.`,
        status,
        category,
        confidenceScore,
        publicationStatus: "DRAFT",
        verdictDate: new Date(decision.decision_date),
        ecli: decision.ecli || null,
        pourvoiNumber: decision.number || null,
        caseNumbers: decision.numbers || [],
        verifiedAt: null,
        sources: {
          create: {
            url: `https://www.courdecassation.fr/decision/${decision.id}`,
            title: `Cour de cassation - ${decision.solution} (${decision.number})`,
            publisher: "Cour de cassation",
            publishedAt: new Date(decision.decision_date),
            sourceType: "JUDILIBRE",
          },
        },
      },
    });

    if (verbose) {
      console.log(`  ✓ Nouvelle affaire créée: ${title}`);
    }

    return true;
  } catch (error) {
    // Handle unique constraint violation (ECLI already exists)
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      if (verbose) {
        console.log(`  - Affaire déjà existante (ECLI ${decision.ecli}), ignorée`);
      }
      return false;
    }
    console.error(`  ✗ Erreur création affaire:`, error);
    return false;
  }
}

// ============================================
// STATUS ORDERING
// ============================================

/** Status severity order (higher = more definitive) */
const STATUS_ORDER: Record<string, number> = {
  ENQUETE_PRELIMINAIRE: 1,
  INSTRUCTION: 2,
  MISE_EN_EXAMEN: 3,
  RENVOI_TRIBUNAL: 4,
  PROCES_EN_COURS: 5,
  CONDAMNATION_PREMIERE_INSTANCE: 6,
  APPEL_EN_COURS: 7,
  CONDAMNATION_DEFINITIVE: 8,
  RELAXE: 8,
  ACQUITTEMENT: 8,
  NON_LIEU: 8,
  PRESCRIPTION: 8,
  CLASSEMENT_SANS_SUITE: 8,
};

/** Terminal statuses — definitive resolution of the affair */
const TERMINAL_STATUSES = new Set<string>([
  "RELAXE",
  "ACQUITTEMENT",
  "NON_LIEU",
  "PRESCRIPTION",
  "CLASSEMENT_SANS_SUITE",
]);

/**
 * Determine if a status transition should be applied.
 *
 * Rules:
 * 1. Normal flow: only upgrade (higher severity)
 * 2. Terminal status exception: RELAXE/ACQUITTEMENT/NON_LIEU/PRESCRIPTION/CLASSEMENT_SANS_SUITE
 *    can be applied from any non-terminal state (court resolution)
 * 3. CONDAMNATION_DEFINITIVE cannot be downgraded (all appeals exhausted)
 */
export function shouldUpdateStatus(current: AffairStatus, candidate: AffairStatus): boolean {
  if (current === candidate) return false;

  // Rule 1: Normal upgrade
  if ((STATUS_ORDER[candidate] ?? 0) > (STATUS_ORDER[current] ?? 0)) {
    return true;
  }

  // Rule 2: Terminal status from non-terminal (except CONDAMNATION_DEFINITIVE)
  if (TERMINAL_STATUSES.has(candidate)) {
    // Rule 3: CONDAMNATION_DEFINITIVE = all appeals exhausted, can't be reversed
    if (current === "CONDAMNATION_DEFINITIVE") return false;
    // Can't go from one terminal to another
    if (TERMINAL_STATUSES.has(current)) return false;
    return true;
  }

  return false;
}

// ============================================
// JURISDICTION CROSS-CHECK
// ============================================

const JURISDICTION_MISMATCH_PENALTY = 30;

export interface JurisdictionCheckResult {
  match: boolean | "unknown";
  jurisdiction: string | null;
}

/**
 * Cross-check the court jurisdiction from the decision text against
 * the politician's departments (from mandates).
 *
 * Returns:
 * - { match: true } if jurisdiction overlaps with politician's departments
 * - { match: false } if jurisdiction is known but doesn't overlap → lower confidence
 * - { match: "unknown" } if jurisdiction not found or not in table → no filtering
 */
export function checkJurisdictionMatch(
  text: string,
  politicianDepartments: string[]
): JurisdictionCheckResult {
  const jurisdiction = extractJurisdictionName(text);

  if (!jurisdiction) {
    return { match: "unknown", jurisdiction: null };
  }

  if (politicianDepartments.length === 0) {
    return { match: "unknown", jurisdiction };
  }

  const courtDepartments = findCourtDepartments(jurisdiction);

  if (!courtDepartments) {
    return { match: "unknown", jurisdiction };
  }

  const hasOverlap = politicianDepartments.some((dep) =>
    courtDepartments.some((courtDep) => courtDep.toLowerCase() === dep.toLowerCase())
  );

  return { match: hasOverlap, jurisdiction };
}

// ============================================
// MAIN SYNC
// ============================================

/**
 * Main Judilibre sync orchestrator
 */
export async function syncJudilibre(
  options: JudilibreSyncOptions = {}
): Promise<JudilibreSyncStats> {
  const { dryRun = false, force = false, limit, politicianSlug, verbose } = options;

  const stats: JudilibreSyncStats = {
    politiciansSearched: 0,
    decisionsFound: 0,
    decisionsRelevant: 0,
    affairsEnriched: 0,
    affairsCreated: 0,
    decisionsSkipped: 0,
    decisionsBlocked: 0,
    decisionsUndecided: 0,
    decisionsShortCircuited: 0,
    errors: 0,
  };

  // Check sync interval (unless forced)
  if (!force && !politicianSlug) {
    const shouldSync = await syncMetadata.shouldSync(SYNC_SOURCE_KEY, MIN_SYNC_INTERVAL_MS);
    if (!shouldSync) {
      console.log("Sync Judilibre déjà effectué récemment. Utilisez --force pour forcer.");
      return stats;
    }
  }

  // Initialize client
  const client = createJudilibreClient();
  if (!client) {
    console.error("Judilibre non configuré. Vérifiez les variables d'environnement.");
    stats.errors++;
    return stats;
  }

  // Load IdentityDecision cache (blocked + confirmed)
  const decisionCache = await loadJudilibreDecisionCache();
  if (verbose) {
    console.log(
      `Cache: ${decisionCache.size.blocked} bloque(s), ${decisionCache.size.confirmed} confirme(s)\n`
    );
  }

  // Get politicians to search
  const politicians = await getPoliticiansToSearch(politicianSlug, limit);
  console.log(`${politicians.length} politicien(s) a rechercher\n`);

  // Anchors every proposal this pass files. Skipped on dry runs, which write nothing.
  const importRunId = dryRun ? null : await startImportRun(IMPORTER_JUDILIBRE);

  try {
    await runJudilibreSearch({
      politicians,
      client,
      decisionCache,
      stats,
      dryRun,
      verbose,
      importRunId,
    });
  } catch (error) {
    if (importRunId) await failImportRun(importRunId, error);
    throw error;
  }

  if (importRunId) {
    await finishImportRun(importRunId, {
      affairsEnriched: stats.affairsEnriched,
      affairsCreated: stats.affairsCreated,
      decisionsRelevant: stats.decisionsRelevant,
      errors: stats.errors,
    });
  }

  return stats;
}

interface JudilibreSearchArgs {
  politicians: PoliticianForSearch[];
  client: JudilibreClient;
  decisionCache: Awaited<ReturnType<typeof loadJudilibreDecisionCache>>;
  stats: JudilibreSyncStats;
  dryRun: boolean;
  verbose?: boolean;
  importRunId: string | null;
}

/**
 * Extracted from syncJudilibre so the ImportRun lifecycle (start, finish, fail)
 * wraps the whole pass in one place.
 */
async function runJudilibreSearch(args: JudilibreSearchArgs): Promise<void> {
  const { politicians, client, decisionCache, stats, dryRun, verbose, importRunId } = args;

  for (const politician of politicians) {
    stats.politiciansSearched++;

    try {
      const decisions = await searchPoliticianDecisions(client, politician, verbose);
      stats.decisionsFound += decisions.length;
      if (decisions.length === 0) continue;

      for (const decision of decisions) {
        // Step a: Prior SAME -> short-circuit to enrich
        const confirmed = decisionCache.getConfirmed(decision.id, politician.id);
        if (confirmed) {
          stats.decisionsShortCircuited++;
          const matches = await findMatchingAffairs({
            politicianId: politician.id,
            title: buildTitleFromDecision(decision),
            ecli: decision.ecli,
            pourvoiNumber: decision.number,
            caseNumbers: decision.numbers,
            category: mapJudilibreToCategory(decision.themes, decision.summary),
            verdictDate: new Date(decision.decision_date),
          });
          const bestMatch = matches[0];
          if (
            bestMatch &&
            (bestMatch.confidence === "CERTAIN" || bestMatch.confidence === "HIGH")
          ) {
            const enriched = await enrichAffairFromJudilibre(
              bestMatch.affairId,
              decision,
              dryRun,
              verbose,
              importRunId
            );
            if (enriched) stats.affairsEnriched++;
          }
          continue;
        }

        // Step b: Blocklist check
        if (decisionCache.isBlocked(decision.id, politician.id)) {
          stats.decisionsBlocked++;
          if (verbose) {
            console.log(`  - ${decision.id} bloque pour ${politician.fullName}`);
          }
          continue;
        }

        // Step c: Age gate
        if (politician.birthDate) {
          const decisionDate = new Date(decision.decision_date);
          const ageAtDecision =
            (decisionDate.getTime() - politician.birthDate.getTime()) /
            (365.25 * 24 * 60 * 60 * 1000);
          if (ageAtDecision < MIN_AGE_AT_DECISION) continue;
        }

        // Steps d-h replaced: resolve via signal-based affair-matching resolver.
        // ExternalId pre-filter, name detection, jurisdiction context, scoring, and
        // persistence (AffairPoliticianDecision) are handled inside the resolver.
        // The resolver handles name detection, jurisdiction context, scoring, and
        // persistence (AffairPoliticianDecision) in a single pass.
        const summary = decision.summary || "";
        let resolveResult;
        try {
          resolveResult = await resolveAffairPolitician({
            text: summary,
            metadata: {
              source: DataSource.JUDILIBRE,
              sourceRef: decision.ecli ?? null,
              verdictDate: new Date(decision.decision_date),
              externalIds: {
                ecli: decision.ecli ?? null,
                pourvoiNumber: decision.number ?? null,
              },
            },
          });
        } catch (resolveError) {
          console.error(`  Erreur résolution ${decision.id}:`, resolveError);
          stats.errors++;
          continue;
        }

        stats.decisionsRelevant++;

        // Step i: Action based on resolver judgment
        if (resolveResult.judgment === "SAME" && resolveResult.topCandidateId) {
          const resolvedPoliticianId = resolveResult.topCandidateId;
          const matches = await findMatchingAffairs({
            politicianId: resolvedPoliticianId,
            title: buildTitleFromDecision(decision),
            ecli: decision.ecli,
            pourvoiNumber: decision.number,
            caseNumbers: decision.numbers,
            category: mapJudilibreToCategory(decision.themes, decision.summary),
            verdictDate: new Date(decision.decision_date),
          });

          const bestMatch = matches[0];

          if (
            bestMatch &&
            (bestMatch.confidence === "CERTAIN" || bestMatch.confidence === "HIGH")
          ) {
            const enriched = await enrichAffairFromJudilibre(
              bestMatch.affairId,
              decision,
              dryRun,
              verbose,
              importRunId
            );
            if (enriched) stats.affairsEnriched++;
          } else if (analyzeIfConviction(decision)) {
            // Full-text gate: re-resolve on the full decision text to confirm identity
            let shouldCreate = true;
            try {
              const fullDecision = await client.getDecision(decision.id);
              const fullTextResult = await resolveAffairPolitician({
                text: fullDecision.text,
                metadata: {
                  source: DataSource.JUDILIBRE,
                  sourceRef: decision.ecli ?? null,
                  verdictDate: new Date(decision.decision_date),
                  externalIds: {
                    ecli: decision.ecli ?? null,
                    pourvoiNumber: decision.number ?? null,
                  },
                },
              });
              if (fullTextResult.judgment === "NO_MATCH") {
                if (verbose) {
                  console.log(`  - ${decision.ecli} : nom absent du texte integral, ignoree`);
                }
                shouldCreate = false;
                stats.decisionsSkipped++;
              }
            } catch {
              if (verbose) {
                console.log(`  Impossible de recuperer le texte integral de ${decision.id}`);
              }
            }

            if (shouldCreate) {
              const created = await createAffairFromJudilibre(
                resolvedPoliticianId,
                decision,
                politician.departments,
                dryRun,
                verbose
              );
              if (created) stats.affairsCreated++;
            }
          } else {
            stats.decisionsSkipped++;
            if (verbose) {
              console.log(`  - ${decision.ecli || decision.id} : procedurale, ignoree`);
            }
          }
        } else if (resolveResult.judgment === "UNDECIDED") {
          stats.decisionsUndecided++;
          if (verbose) {
            console.log(
              `  ? ${decision.id} : UNDECIDED (decisionId=${resolveResult.decisionId}, score=${resolveResult.topScore})`
            );
          }
        } else {
          stats.decisionsSkipped++;
          if (verbose && resolveResult.judgment === "NO_MATCH") {
            console.log(`  - ${decision.id} : NO_MATCH pour ${politician.fullName}`);
          }
        }
      }
    } catch (error) {
      stats.errors++;
      console.error(`  Erreur pour ${politician.fullName}:`, error);
    }
  }

  // Update sync metadata
  if (!dryRun) {
    await syncMetadata.markCompleted(SYNC_SOURCE_KEY, {
      itemCount: stats.affairsEnriched + stats.affairsCreated,
    });
  }
}

// ============================================
// HELPERS
// ============================================

/**
 * Extract unique department names from mandates.
 * Uses constituency (e.g. "Rhône (3ème)") as department name source,
 * stripping any parenthetical suffix. Falls back to departmentCode if no constituency.
 */
function extractDepartments(
  mandates: { constituency: string | null; departmentCode: string | null }[]
): string[] {
  const departments = new Set<string>();

  for (const m of mandates) {
    if (m.constituency) {
      // Strip parenthetical suffix: "Rhône (3ème)" → "Rhône"
      const name = m.constituency.replace(/\s*\(.*\)$/, "").trim();
      if (name) departments.add(name);
    } else if (m.departmentCode) {
      // Fallback: keep the code for future resolution
      departments.add(m.departmentCode);
    }
  }

  return Array.from(departments);
}

/**
 * Get politicians to search, prioritizing those with existing affairs
 */
async function getPoliticiansToSearch(
  slug?: string,
  limit?: number
): Promise<PoliticianForSearch[]> {
  if (slug) {
    const politician = await db.politician.findUnique({
      where: { slug },
      select: {
        id: true,
        fullName: true,
        slug: true,
        birthDate: true,
        _count: { select: { affairs: true } },
        mandates: { select: { constituency: true, departmentCode: true } },
      },
    });
    if (!politician) {
      console.error(`Politicien non trouvé: ${slug}`);
      return [];
    }
    return [
      {
        ...politician,
        hasAffairs: politician._count.affairs > 0,
        departments: extractDepartments(politician.mandates),
      },
    ];
  }

  // Fetch all politicians, prioritize those with existing affairs
  const politicians = await db.politician.findMany({
    select: {
      id: true,
      fullName: true,
      slug: true,
      birthDate: true,
      _count: { select: { affairs: true } },
      mandates: { select: { constituency: true, departmentCode: true } },
    },
    orderBy: [{ affairs: { _count: "desc" } }, { fullName: "asc" }],
    ...(limit ? { take: limit } : {}),
  });

  return politicians.map((p) => ({
    id: p.id,
    fullName: p.fullName,
    slug: p.slug,
    birthDate: p.birthDate,
    hasAffairs: p._count.affairs > 0,
    departments: extractDepartments(p.mandates),
  }));
}

/**
 * Get Judilibre sync statistics
 */
export async function getJudilibreStats(): Promise<void> {
  const [
    meta,
    affairsWithEcli,
    affairsWithJudilibreSource,
    totalAffairs,
    recentJudilibre,
    identityDecisions,
  ] = await Promise.all([
    syncMetadata.get(SYNC_SOURCE_KEY),
    db.affair.count({ where: { ecli: { not: null } } }),
    db.source.count({ where: { sourceType: "JUDILIBRE" } }),
    db.affair.count(),
    db.affair.findMany({
      where: { sources: { some: { sourceType: "JUDILIBRE" } } },
      select: {
        title: true,
        ecli: true,
        status: true,
        verdictDate: true,
        politician: { select: { fullName: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    db.identityDecision.groupBy({
      by: ["judgement"],
      where: { sourceType: DataSource.JUDILIBRE, supersededBy: null },
      _count: true,
    }),
  ]);

  console.log("\n" + "=".repeat(60));
  console.log("Judilibre Sync Stats");
  console.log("=".repeat(60));

  if (meta) {
    console.log(`\nDernier sync: ${meta.lastSyncAt?.toLocaleString("fr-FR") ?? "jamais"}`);
    console.log(`Items traités: ${meta.itemCount ?? 0}`);
  } else {
    console.log("\nAucun sync effectué");
  }

  console.log(`\nAffaires totales: ${totalAffairs}`);
  console.log(`Affaires avec ECLI: ${affairsWithEcli}`);
  console.log(`Sources Judilibre: ${affairsWithJudilibreSource}`);

  if (identityDecisions.length > 0) {
    const counts = Object.fromEntries(identityDecisions.map((d) => [d.judgement, d._count]));
    const total = identityDecisions.reduce((sum, d) => sum + d._count, 0);
    console.log(`\nIdentity decisions: ${total}`);
    console.log(`  SAME (auto-confirmed): ${counts.SAME ?? 0}`);
    console.log(`  UNDECIDED (admin review): ${counts.UNDECIDED ?? 0}`);
    console.log(`  NOT_SAME (blocked): ${counts.NOT_SAME ?? 0}`);
  }

  if (recentJudilibre.length > 0) {
    console.log("\nDernières affaires Judilibre:");
    for (const a of recentJudilibre) {
      const date = a.verdictDate?.toISOString().split("T")[0] ?? "?";
      console.log(`  [${date}] ${a.politician.fullName} - ${a.title}`);
      if (a.ecli) console.log(`    ECLI: ${a.ecli}`);
    }
  }
}
