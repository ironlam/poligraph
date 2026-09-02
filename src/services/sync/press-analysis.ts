/**
 * Press Analysis Sync Service
 *
 * Orchestrates AI analysis of press articles for judicial affair detection:
 * 1. Fetch unanalyzed PressArticles
 * 2. Scrape full article content (not stored — copyright)
 * 3. Analyze with Mistral (JSON mode)
 * 4. Match detected affairs with existing DB affairs
 * 5. Enrich existing affairs or create new ones (publicationStatus: DRAFT)
 *
 * Key difference from Judilibre: press NEVER modifies affair status
 * (press has no legal authority, only Judilibre upgrades status).
 */

import { db } from "@/lib/db";
import type { AffairCategory, AffairStatus, SourceType } from "@/generated/prisma";
import { cleanAffairTitle, generateSlug, sleep } from "@/lib/utils";
import { getArticleScraper } from "@/lib/api/article-scraper";
import {
  analyzeArticle,
  isSensitiveCategory,
  getAIRateLimitMs,
  type DetectedAffair,
  type ArticleAnalysisResult,
} from "@/services/press-analysis";
import { classifyAffairMatches, findMatchingAffairs } from "@/services/affairs/matching";
import { syncMetadata } from "@/lib/sync";
import { classifyArticleTier, type ArticleTier } from "@/config/press-keywords";
import { MIN_CONFIDENCE_THRESHOLD } from "@/config/press-analysis";
import {
  resolveAffairPolitician,
  assessPressAttribution,
  assessProcedureEvidence,
} from "@/lib/affair-matching";
import { previewAffairPolitician } from "@/lib/affair-matching/resolver";
import { createDraftAffairFromDiscovery } from "@/services/affairs/create-draft";
import { safeJsonParseOrThrow } from "@/lib/api/safe-json";
import {
  hashSourceContent,
  previewAffairEventProposal,
  proposeAffairEvent,
  type PreviewAffairEventProposalOutcome,
  type ProposeAffairEventOutcome,
} from "@/services/affairs/proposals";
import { IMPORTER_PRESS_ANALYSIS, withImportRun } from "@/services/affairs/import-run";
import { isVerifiedAffairPressUrl } from "@/config/affair-sources";

// ============================================
// TYPES
// ============================================

export interface PressAnalysisOptions {
  dryRun?: boolean;
  force?: boolean;
  limit?: number;
  feedSource?: string;
  politicianSlug?: string;
  reanalyze?: boolean;
  verbose?: boolean;
}

export interface PressAnalysisStats {
  articlesProcessed: number;
  articlesAnalyzed: number;
  articlesAffairRelated: number;
  affairsEnriched: number;
  affairsCreated: number;
  affairsRejected: number;
  proposalsPending: number;
  proposalsDeduped: number;
  proposalsWouldCreate: number;
  proposalsDedupedPending: number;
  proposalsDedupedTerminal: number;
  eventsAlreadyApplied: number;
  ambiguousMatches: number;
  insufficientSourceProvenance: number;
  scrapeErrors: number;
  analysisErrors: number;
  sensitiveWarnings: number;
  /**
   * True when analysis stopped early because the AI provider throttled us
   * (quota / rate limit / payment required). Distinguishes an expected
   * cost/credit stop (leaves a backlog for the manual catch-up) from a real
   * code/infra breakage.
   */
  quotaStopped: boolean;
}

/**
 * Whether a press-analysis run should count as successful for the daily sync.
 *
 * A run only fails when it had articles to analyze but got none through for a
 * non-quota reason (e.g. DB down, a code bug) — that is a real breakage worth
 * paging. Isolated per-article errors (analyzed > 0) and an early quota/credit
 * stop are tolerated: the leftover backlog is drained via the email notifier
 * plus the manual `/analyse-presse` catch-up.
 */
export function isPressAnalysisSuccessful(
  stats: Pick<PressAnalysisStats, "articlesProcessed" | "articlesAnalyzed" | "quotaStopped">
): boolean {
  return !(stats.articlesProcessed > 0 && stats.articlesAnalyzed === 0 && !stats.quotaStopped);
}

// ============================================
// CONSTANTS
// ============================================

const SYNC_SOURCE_KEY = "press-analysis";
const MIN_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

// ============================================
// MAIN SYNC
// ============================================

/**
 * Main press analysis sync orchestrator
 */
export async function syncPressAnalysis(
  options: PressAnalysisOptions = {}
): Promise<PressAnalysisStats> {
  const {
    dryRun = false,
    force = false,
    limit,
    feedSource,
    politicianSlug,
    reanalyze = false,
    verbose = false,
  } = options;

  const stats: PressAnalysisStats = {
    articlesProcessed: 0,
    articlesAnalyzed: 0,
    articlesAffairRelated: 0,
    affairsEnriched: 0,
    affairsCreated: 0,
    affairsRejected: 0,
    proposalsPending: 0,
    proposalsDeduped: 0,
    proposalsWouldCreate: 0,
    proposalsDedupedPending: 0,
    proposalsDedupedTerminal: 0,
    eventsAlreadyApplied: 0,
    ambiguousMatches: 0,
    insufficientSourceProvenance: 0,
    scrapeErrors: 0,
    analysisErrors: 0,
    sensitiveWarnings: 0,
    quotaStopped: false,
  };

  // Check sync interval
  if (!force && !politicianSlug) {
    const shouldSync = await syncMetadata.shouldSync(SYNC_SOURCE_KEY, MIN_SYNC_INTERVAL_MS);
    if (!shouldSync) {
      console.log("Analyse presse déjà effectuée récemment. Utilisez --force pour forcer.");
      return stats;
    }
  }

  // Get articles to analyze
  const articles = await getArticlesToAnalyze({
    feedSource,
    politicianSlug,
    reanalyze,
    limit,
  });

  if (articles.length === 0) {
    console.log("Aucun article à analyser.");
    return stats;
  }

  console.log(`${articles.length} article(s) à analyser`);

  // Classify articles into tiers and sort by priority
  const classifiedArticles = articles.map((article) => ({
    ...article,
    tier: classifyArticleTier(article.title, article.description) as ArticleTier,
  }));

  // Sort: Tier 1 first, then Tier 2 (most recent first within tier)
  classifiedArticles.sort((a, b) => {
    if (a.tier === "TIER_1" && b.tier !== "TIER_1") return -1;
    if (a.tier !== "TIER_1" && b.tier === "TIER_1") return 1;
    return b.publishedAt.getTime() - a.publishedAt.getTime();
  });

  const tier1Count = classifiedArticles.filter((a) => a.tier === "TIER_1").length;
  console.log(`  Tier 1 (Sonnet, mots-clés judiciaires): ${tier1Count}`);
  console.log(`  Tier 2 (Haiku, couverture large): ${classifiedArticles.length - tier1Count}\n`);

  const execute = async (importRunId: string | null): Promise<PressAnalysisStats> => {
    const scraper = getArticleScraper();

    for (const article of classifiedArticles) {
      stats.articlesProcessed++;

      if (verbose) {
        console.log(
          `\n[${stats.articlesProcessed}/${classifiedArticles.length}] [${article.tier}] ${article.feedSource}: ${article.title.slice(0, 80)}...`
        );
      }

      // Step 1: Get article content, scrape or fallback to RSS
      let analysisContent: string;

      if (scraper.canScrape(article.feedSource)) {
        const content = await scraper.extractArticle(article.url, article.feedSource);

        if (!content) {
          stats.scrapeErrors++;
          // Fallback to RSS title+description even for scrapable sources
          analysisContent = buildRSSFallbackContent(article);
          if (verbose) {
            console.log("  ⚠ Scrape échoué, fallback RSS");
          }
        } else {
          analysisContent = content.textContent;
          if (verbose) {
            console.log(`  Contenu extrait: ${content.length} chars`);
          }
        }
      } else {
        // Paywalled source (lemonde, lefigaro): use RSS title+description
        analysisContent = buildRSSFallbackContent(article);
        if (verbose) {
          console.log("  Source payante, analyse sur titre+description RSS");
        }
      }

      // Step 2: AI Analysis
      try {
        // Get pre-detected politician mentions from the article
        const mentionedNames = article.mentions.map((m) => m.politician.fullName);

        const result = await analyzeArticle({
          title: article.title,
          content: analysisContent,
          feedSource: article.feedSource,
          publishedAt: article.publishedAt,
          mentionedPoliticians: mentionedNames,
          tier: article.tier,
        });

        await processAnalyzedArticle(article, analysisContent, result, stats, {
          dryRun,
          verbose,
          importRunId,
        });
      } catch (error) {
        stats.analysisErrors++;
        const errorMsg = error instanceof Error ? error.message : String(error);

        // Detect quota/rate limit errors to avoid marking articles and to stop early
        const isQuotaError = /usage.limits|quota|rate.limit|429|402/i.test(errorMsg);

        if (!dryRun) {
          await db.pressArticle.update({
            where: { id: article.id },
            data: {
              // Don't mark as analyzed on quota errors so they can be retried
              ...(isQuotaError ? {} : { aiAnalyzedAt: new Date() }),
              aiAnalysisError: errorMsg.slice(0, 500),
            },
          });
        }

        if (isQuotaError) {
          stats.quotaStopped = true;
          console.error(`\n✗ API quota/rate limit error, stopping early: ${errorMsg}`);
          break;
        }

        console.error(`  ✗ Analyse IA échouée: ${errorMsg}`);
      }

      // Rate limit between AI calls
      await sleep(getAIRateLimitMs());
    }

    // Update sync metadata
    if (!dryRun) {
      await syncMetadata.markCompleted(SYNC_SOURCE_KEY, {
        itemCount: stats.articlesAnalyzed,
      });
    }

    return stats;
  };

  if (dryRun) return execute(null);

  return withImportRun(IMPORTER_PRESS_ANALYSIS, async ({ importRunId, setStats }) => {
    const result = await execute(importRunId);
    setStats({
      proposalsPending: result.proposalsPending,
      proposalsDeduped: result.proposalsDeduped,
      proposalsWouldCreate: result.proposalsWouldCreate,
      proposalsDedupedPending: result.proposalsDedupedPending,
      proposalsDedupedTerminal: result.proposalsDedupedTerminal,
      eventsAlreadyApplied: result.eventsAlreadyApplied,
      ambiguousMatches: result.ambiguousMatches,
      insufficientSourceProvenance: result.insufficientSourceProvenance,
      affairsCreated: result.affairsCreated,
    });
    return result;
  });
}

/** Article fields needed to persist an analysis result. */
export interface AnalyzedArticleRef {
  id: string;
  url: string;
  title: string;
  feedSource: string;
  publishedAt: Date;
}

function normalizeExcerpt(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Keeps only a model-proposed excerpt that is actually present in the source text. */
export function findVerifiedPressExcerpt(
  excerpts: string[],
  analysisContent: string
): string | null {
  const normalizedContent = normalizeExcerpt(analysisContent);
  for (const excerpt of excerpts) {
    const normalized = normalizeExcerpt(excerpt);
    if (normalized && normalizedContent.includes(normalized)) return excerpt.trim().slice(0, 500);
  }
  return null;
}

/**
 * Persist one article's analysis result: mark it analyzed, then resolve, guard,
 * match and create/enrich/link affairs for each detected affair. Mutates `stats`.
 *
 * Split out of syncPressAnalysis so the exact same deterministic post-analysis
 * pipeline (resolver + attribution guard + matching + writes, no AI cost) can be
 * reused by the manual API-free catch-up, where `result` comes from a Claude Code
 * session instead of analyzeArticle().
 */
export async function processAnalyzedArticle(
  article: AnalyzedArticleRef,
  analysisContent: string,
  result: ArticleAnalysisResult,
  stats: PressAnalysisStats,
  options: { dryRun: boolean; verbose: boolean; importRunId?: string | null }
): Promise<void> {
  const { dryRun, verbose, importRunId = null } = options;

  stats.articlesAnalyzed++;

  // Step 3: Update article with analysis results
  if (!dryRun) {
    await db.pressArticle.update({
      where: { id: article.id },
      data: {
        aiSummary: result.summary,
        aiAnalyzedAt: new Date(),
        isAffairRelated: result.isAffairRelated,
        aiAnalysisError: null,
      },
    });
  }

  if (verbose) {
    console.log(`  Résumé: ${result.summary.slice(0, 100)}...`);
    console.log(`  Affaire(s) détectée(s): ${result.affairs.length}`);
  }

  if (!result.isAffairRelated || result.affairs.length === 0) {
    return;
  }

  stats.articlesAffairRelated++;

  // Step 4: Process each detected affair
  for (const detected of result.affairs) {
    // Check sensitive categories
    if (isSensitiveCategory(detected.category)) {
      stats.sensitiveWarnings++;
      console.warn(
        `  ⚠ CATÉGORIE SENSIBLE: ${detected.category} pour ${detected.politicianName} — ${detected.title}`
      );
    }

    // Skip politicians only mentioned but not involved in the affair
    if (detected.involvement === "MENTIONED_ONLY") {
      if (verbose) {
        console.log(`  - ${detected.politicianName} simplement mentionné, pas impliqué → ignoré`);
      }
      continue;
    }

    // Procedure guard: AffairStatus has no "no procedure" value, so the
    // extraction has to emit a judicial status even on an article that
    // describes none. Block before the resolver, which would otherwise write an
    // AffairPoliticianDecision audit row for a detection we are discarding.
    const procedure = assessProcedureEvidence({ text: analysisContent });
    if (!procedure.hasProcedure) {
      if (verbose) {
        console.log(`  - Aucune procédure judiciaire dans l'article → "${detected.title}" ignoré`);
      }
      await rejectWeakAttribution(article.id, null, detected, procedure.verdict, dryRun);
      stats.affairsRejected++;
      continue;
    }

    // Resolve politician via the deterministic resolver (full DB, no context window)
    const resolverInput = {
      text: analysisContent,
      candidateNames: detected.mentionedNames,
      metadata: {
        source: "PRESSE" as SourceType,
        sourceRef: article.url ?? null,
        factsDate: detected.factsDate ? new Date(detected.factsDate) : null,
        court: detected.court ?? null,
      },
    };
    const resolveResult = dryRun
      ? await previewAffairPolitician(resolverInput)
      : await resolveAffairPolitician(resolverInput);

    if (resolveResult.judgment !== "SAME" || !resolveResult.topCandidateId) {
      if (verbose) {
        console.log(
          `  - Résolution ${resolveResult.judgment} (decisionId=${resolveResult.decisionId}) pour "${detected.politicianName}" → ignoré`
        );
      }
      continue;
    }

    const politicianId = resolveResult.topCandidateId;

    // Attribution guard (issue #376): the resolver only confirms the name is
    // in the article, not that this politician is a party to the procedure.
    // Block attachments to commenters, the local mayor, reacting ministers
    // and homonyms before any DB write, independently of the LLM-reported
    // involvement.
    const resolvedPolitician = await db.politician.findUnique({
      where: { id: politicianId },
      select: { firstName: true, lastName: true, fullName: true },
    });
    if (resolvedPolitician) {
      const attribution = assessPressAttribution({
        text: analysisContent,
        firstName: resolvedPolitician.firstName,
        lastName: resolvedPolitician.lastName,
        involvement: detected.involvement,
      });
      if (!attribution.attach) {
        if (verbose) {
          console.log(
            `  - Attribution bloquée (${attribution.verdict}) : ${resolvedPolitician.fullName} → "${detected.title}" ignoré`
          );
        }
        await rejectWeakAttribution(
          article.id,
          politicianId,
          detected,
          attribution.verdict,
          dryRun
        );
        stats.affairsRejected++;
        continue;
      }
    }

    // Try to match with existing affairs
    const matches = await findMatchingAffairs({
      politicianId,
      title: detected.title,
      category: detected.category as AffairCategory,
      status: detected.status as AffairStatus,
    });
    const routing = classifyAffairMatches(matches);

    if (routing.kind === "CONFIDENT_MATCH") {
      // Enrich existing affair
      const enriched = await enrichAffairFromPress(
        routing.match.affairId,
        article.id,
        article.url,
        article.title,
        article.feedSource,
        article.publishedAt,
        detected,
        dryRun,
        verbose
      );
      if (enriched) {
        stats.affairsEnriched++;
        if (!dryRun && resolveResult.decisionId) {
          await db.affairPoliticianDecision.update({
            where: { id: resolveResult.decisionId },
            data: { affairId: routing.match.affairId },
          });
        }
      }
      continue;
    }

    if (routing.kind === "CONFIDENT_AMBIGUOUS" || routing.kind === "POSSIBLE_AMBIGUOUS") {
      stats.ambiguousMatches++;
    }

    if (detected.isNewRevelation) {
      // Reject low-confidence detections before creating
      if (detected.confidenceScore < MIN_CONFIDENCE_THRESHOLD) {
        await rejectLowConfidenceAffair(article.id, politicianId, detected, dryRun, verbose);
        stats.affairsRejected++;
        continue;
      }

      if (
        routing.kind === "UNIQUE_EVOLUTION" &&
        detected.statusValidated === true &&
        detected.categoryValidated === true
      ) {
        const sourceExcerpt = findVerifiedPressExcerpt(detected.excerpts, analysisContent);
        if (sourceExcerpt && isVerifiedAffairPressUrl(article.url)) {
          const eventInput = {
            affairId: routing.match.affairId,
            importer: IMPORTER_PRESS_ANALYSIS,
            sourceUrl: article.url,
            sourceTitle: article.title,
            publishedAt: article.publishedAt,
            publisher: feedSourceToPublisher(article.feedSource),
            pressArticleId: article.id,
            resolverDecisionId: resolveResult.decisionId,
            sourceContentHash: hashSourceContent({
              articleId: article.id,
              sourceUrl: article.url,
              publishedAt: article.publishedAt,
              analysisContent,
            }),
            sourceExcerpt,
            confidence: Math.round(routing.match.score * 100),
            rationale:
              `Candidat d’évolution unique (${routing.match.matchedBy}) pour une affaire ` +
              `pré-décision du même politique. L’article est proposé comme nouvelle source ` +
              `médiatique, sans modification automatique de l’état judiciaire.`,
            extractorVersion: "press-evolution-v1",
          };
          let proposal;
          if (dryRun) {
            proposal = await previewAffairEventProposal(eventInput);
          } else {
            if (!importRunId) throw new Error("ImportRun presse absent pour la proposition");
            proposal = await proposeAffairEvent({ ...eventInput, importRunId });
          }
          recordEventProposalOutcome(stats, proposal.outcome);
          if (verbose && dryRun) {
            console.log(`  [DRY-RUN] Proposition événement : ${proposal.outcome}`);
          }
          if (proposal.outcome !== "TARGET_INELIGIBLE") continue;
        } else if (verbose) {
          console.log("  - Source ou extrait insuffisant, conservation du brouillon de revue");
        }
        if (!sourceExcerpt || !isVerifiedAffairPressUrl(article.url)) {
          stats.insufficientSourceProvenance++;
        }
      }

      // New revelation — create affair as DRAFT (no title prefix)
      const created = await createAffairFromPress(
        politicianId,
        article.id,
        article.url,
        article.title,
        article.feedSource,
        article.publishedAt,
        detected,
        resolveResult.decisionId,
        dryRun,
        verbose
      );
      if (created) stats.affairsCreated++;
    } else if (routing.kind === "NO_MATCH" && routing.looseMatch) {
      // Weaker match — link the article as a MENTION, without touching the affair
      if (!dryRun) {
        await linkArticleToAffair(article.id, routing.looseMatch.affairId, "MENTION");
      }
      if (verbose) {
        console.log(`  → Lien MENTION créé: article ↔ affaire ${routing.looseMatch.affairId}`);
      }
    }
  }
}

function recordEventProposalOutcome(
  stats: PressAnalysisStats,
  outcome: ProposeAffairEventOutcome | PreviewAffairEventProposalOutcome
): void {
  if (outcome === "CREATED") stats.proposalsPending++;
  if (outcome === "WOULD_CREATE") stats.proposalsWouldCreate++;
  if (outcome === "DEDUPED_PENDING") {
    stats.proposalsDeduped++;
    stats.proposalsDedupedPending++;
  }
  if (outcome === "DEDUPED_TERMINAL") {
    stats.proposalsDeduped++;
    stats.proposalsDedupedTerminal++;
  }
  if (outcome === "ALREADY_APPLIED") stats.eventsAlreadyApplied++;
}

// ============================================
// QUERY HELPERS
// ============================================

/**
 * Get articles to analyze based on options
 */
async function getArticlesToAnalyze(options: {
  feedSource?: string;
  politicianSlug?: string;
  reanalyze?: boolean;
  limit?: number;
}) {
  const where: Record<string, unknown> = {};

  // Filter by analysis state
  if (!options.reanalyze) {
    where.aiAnalyzedAt = null;
  }

  // Filter by feed source
  if (options.feedSource) {
    where.feedSource = options.feedSource;
  }

  // Filter by politician
  if (options.politicianSlug) {
    const politician = await db.politician.findUnique({
      where: { slug: options.politicianSlug },
      select: { id: true },
    });
    if (!politician) {
      console.error(`Politicien non trouvé: ${options.politicianSlug}`);
      return [];
    }
    where.mentions = {
      some: { politicianId: politician.id },
    };
  }

  return db.pressArticle.findMany({
    where,
    select: {
      id: true,
      feedSource: true,
      title: true,
      description: true,
      url: true,
      publishedAt: true,
      mentions: {
        include: {
          politician: { select: { id: true, fullName: true, slug: true } },
        },
      },
    },
    orderBy: [{ publishedAt: "desc" }],
    take: options.limit,
  });
}

// ============================================
// ENRICHMENT & CREATION
// ============================================

/**
 * Enrich an existing affair with press source + link
 * NOTE: Press NEVER modifies affair status (no legal authority)
 */
async function enrichAffairFromPress(
  affairId: string,
  articleId: string,
  articleUrl: string,
  articleTitle: string,
  feedSource: string,
  publishedAt: Date,
  detected: DetectedAffair,
  dryRun: boolean,
  verbose?: boolean
): Promise<boolean> {
  if (dryRun) {
    if (verbose) {
      console.log(`  [DRY-RUN] Enrichirait affaire ${affairId} depuis article presse`);
    }
    return true;
  }

  try {
    // Add press source to the affair (for the affair page)
    const existingSource = await db.source.findFirst({
      where: { affairId, url: articleUrl },
    });

    if (!existingSource) {
      await db.source.create({
        data: {
          affairId,
          url: articleUrl,
          title: articleTitle,
          publisher: feedSourceToPublisher(feedSource),
          publishedAt,
          sourceType: "PRESSE",
          excerpt: detected.excerpts[0] || null,
        },
      });
    }

    // Create PressArticleAffair link
    await linkArticleToAffair(articleId, affairId, "UPDATE");

    if (verbose) {
      console.log(`  ✓ Affaire ${affairId} enrichie avec source presse`);
    }
    return true;
  } catch (error) {
    console.error(`  ✗ Erreur enrichissement affaire ${affairId}:`, error);
    return false;
  }
}

/**
 * Create a new affair from a press revelation.
 *
 * publicationStatus is set to DRAFT and verifiedAt left null, which is the
 * sole authoritative signal that the affair has not been editorially
 * validated. The legacy "[À VÉRIFIER]" title prefix is no longer added —
 * relying on publicationStatus avoids the risk of leaking the marker into
 * the public UI when filtering is forgotten somewhere in the data layer.
 */
async function createAffairFromPress(
  politicianId: string,
  articleId: string,
  articleUrl: string,
  articleTitle: string,
  feedSource: string,
  publishedAt: Date,
  detected: DetectedAffair,
  decisionId: string | null,
  dryRun: boolean,
  verbose?: boolean
): Promise<boolean> {
  const title = detected.title;

  if (dryRun) {
    console.log(`  [DRY-RUN] Créerait affaire: ${title}`);
    return true;
  }

  try {
    const affair = await createDraftAffairFromDiscovery({
      politicianId,
      title,
      baseSlug: generateSlug(cleanAffairTitle(title)),
      description: detected.description,
      status: detected.status as AffairStatus,
      category: detected.category as AffairCategory,
      // Without this the Prisma default (MENTIONED_ONLY) applied, while the loop
      // above `continue`s on MENTIONED_ONLY detections: every press-created
      // affair claimed the politician was neither mis en cause nor poursuivi.
      involvement: detected.involvement,
      confidenceScore: detected.confidenceScore,
      factsDate: detected.factsDate ? new Date(detected.factsDate) : null,
      court: detected.court,
      sources: [
        {
          url: articleUrl,
          title: articleTitle,
          publisher: feedSourceToPublisher(feedSource),
          publishedAt,
          sourceType: "PRESSE",
          excerpt: detected.excerpts[0] || null,
        },
      ],
    });

    // Link article to affair
    await linkArticleToAffair(articleId, affair.id, "REVELATION");

    // Lie la décision du resolver à l'affaire créée (audit du rattachement,
    // prérequis du publish-guard Phase 2).
    if (decisionId) {
      await db.affairPoliticianDecision.update({
        where: { id: decisionId },
        data: { affairId: affair.id },
      });
    }

    if (verbose) {
      const scoreLabel = detected.confidenceScore >= 70 ? "✓" : "⚠";
      console.log(
        `  ${scoreLabel} Nouvelle affaire créée: ${title} (confiance: ${detected.confidenceScore}/100)`
      );
    }
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      if (verbose) {
        console.log(`  - Affaire déjà existante (slug), ignorée`);
      }
      return false;
    }
    console.error(`  ✗ Erreur création affaire:`, error);
    return false;
  }
}

/**
 * Create PressArticleAffair link (upsert to avoid duplicates)
 */
async function linkArticleToAffair(
  articleId: string,
  affairId: string,
  role: "REVELATION" | "MENTION" | "UPDATE"
): Promise<void> {
  await db.pressArticleAffair.upsert({
    where: {
      articleId_affairId: { articleId, affairId },
    },
    create: { articleId, affairId, role },
    update: { role },
  });
}

/**
 * Log a rejected low-confidence affair detection to DB
 */
async function rejectLowConfidenceAffair(
  articleId: string,
  politicianId: string | null,
  detected: DetectedAffair,
  dryRun: boolean,
  verbose?: boolean
): Promise<void> {
  if (verbose) {
    console.log(
      `  ✗ Rejeté (confiance: ${detected.confidenceScore}/${MIN_CONFIDENCE_THRESHOLD}): ${detected.title} — ${detected.politicianName}`
    );
  }

  if (dryRun) return;

  await db.pressAnalysisRejection.create({
    data: {
      articleId,
      politicianId,
      politicianName: detected.politicianName,
      detectedAffair: safeJsonParseOrThrow(JSON.stringify(detected)),
      confidenceScore: detected.confidenceScore,
    },
  });
}

/**
 * Log an affair detection rejected by the attribution guard (issue #376):
 * the resolved politician is only commenting, locally in charge, reacting, or a
 * homonym, so the affair is not attached to their profile. The guard verdict is
 * stored alongside the detection for moderation audit.
 */
async function rejectWeakAttribution(
  articleId: string,
  politicianId: string | null,
  detected: DetectedAffair,
  verdict: string,
  dryRun: boolean
): Promise<void> {
  if (dryRun) return;

  await db.pressAnalysisRejection.create({
    data: {
      articleId,
      politicianId,
      politicianName: detected.politicianName,
      detectedAffair: safeJsonParseOrThrow(
        JSON.stringify({ ...detected, attributionVerdict: verdict })
      ),
      confidenceScore: detected.confidenceScore,
    },
  });
}

// ============================================
// STATS
// ============================================

/**
 * Get press analysis statistics for --stats display
 */
export async function getPressAnalysisStats(): Promise<void> {
  const [
    meta,
    totalArticles,
    analyzedArticles,
    affairRelatedArticles,
    articleAffairLinks,
    pressSourceCount,
    recentAnalyzed,
    errorArticles,
  ] = await Promise.all([
    syncMetadata.get(SYNC_SOURCE_KEY),
    db.pressArticle.count(),
    db.pressArticle.count({ where: { aiAnalyzedAt: { not: null } } }),
    db.pressArticle.count({ where: { isAffairRelated: true } }),
    db.pressArticleAffair.count(),
    db.source.count({ where: { sourceType: "PRESSE" } }),
    db.pressArticle.findMany({
      where: { aiAnalyzedAt: { not: null } },
      select: {
        title: true,
        feedSource: true,
        isAffairRelated: true,
        aiAnalyzedAt: true,
        aiSummary: true,
      },
      orderBy: { aiAnalyzedAt: "desc" },
      take: 5,
    }),
    db.pressArticle.count({
      where: { aiAnalysisError: { not: null } },
    }),
  ]);

  console.log("\n" + "=".repeat(60));
  console.log("Press Analysis Stats");
  console.log("=".repeat(60));

  if (meta) {
    console.log(`\nDernier sync: ${meta.lastSyncAt?.toLocaleString("fr-FR") ?? "jamais"}`);
    console.log(`Items traités: ${meta.itemCount ?? 0}`);
  } else {
    console.log("\nAucun sync effectué");
  }

  const pending = totalArticles - analyzedArticles;
  console.log(`\nArticles totaux: ${totalArticles}`);
  console.log(`Analysés: ${analyzedArticles}`);
  console.log(`En attente: ${pending}`);
  console.log(`Liés à une affaire: ${affairRelatedArticles}`);
  console.log(`Erreurs d'analyse: ${errorArticles}`);
  console.log(`\nLiens article-affaire: ${articleAffairLinks}`);
  console.log(`Sources PRESSE sur affaires: ${pressSourceCount}`);

  if (recentAnalyzed.length > 0) {
    console.log("\nDerniers articles analysés:");
    for (const a of recentAnalyzed) {
      const date = a.aiAnalyzedAt?.toISOString().split("T")[0] ?? "?";
      const affair = a.isAffairRelated ? "⚖️" : "—";
      console.log(`  [${date}] ${affair} ${a.feedSource}: ${a.title.slice(0, 60)}...`);
      if (a.aiSummary) {
        console.log(`    ${a.aiSummary.slice(0, 100)}...`);
      }
    }
  }
}

// ============================================
// HELPERS
// ============================================

/**
 * Build analysis content from RSS data when scraping isn't possible.
 * Less precise than full article but still useful for detecting affairs.
 */
function buildRSSFallbackContent(article: { title: string; description: string | null }): string {
  const parts = [article.title];
  if (article.description) {
    parts.push(article.description);
  }
  return parts.join("\n\n");
}

function feedSourceToPublisher(feedSource: string): string {
  const publishers: Record<string, string> = {
    lemonde: "Le Monde",
    lefigaro: "Le Figaro",
    franceinfo: "Franceinfo",
    liberation: "Libération",
    politico: "Politico",
    mediapart: "Mediapart",
    publicsenat: "Public Sénat",
    lcp: "LCP",
    ouestfrance: "Ouest-France",
    sudouest: "Sud Ouest",
    ladepeche: "La Dépêche du Midi",
    ledauphine: "Le Dauphiné Libéré",
    dna: "DNA",
    googlenews: "Google News",
  };
  return publishers[feedSource] || feedSource;
}
