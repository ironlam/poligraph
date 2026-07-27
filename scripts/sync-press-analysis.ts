/**
 * CLI script to run AI analysis on press articles for judicial affair detection
 *
 * Fetches full article content, analyzes with Claude Haiku,
 * enriches existing affairs or creates new ones (prefixed [À VÉRIFIER]).
 *
 * Usage:
 *   npm run sync:press-analysis                          # Analyze unprocessed articles
 *   npm run sync:press-analysis -- --stats               # Show current stats
 *   npm run sync:press-analysis -- --dry-run             # Preview without saving
 *   npm run sync:press-analysis -- --limit=10            # Limit to N articles
 *   npm run sync:press-analysis -- --feed=mediapart      # Single feed source
 *   npm run sync:press-analysis -- --politician=slug     # Articles mentioning a politician
 *   npm run sync:press-analysis -- --reanalyze           # Re-analyze already processed
 *   npm run sync:press-analysis -- --force               # Ignore min sync interval
 */

import "dotenv/config";
import { createCLI, type SyncHandler, type SyncResult } from "../src/lib/sync";
import {
  syncPressAnalysis,
  getPressAnalysisStats,
  isPressAnalysisSuccessful,
} from "../src/services/sync/press-analysis";

const handler: SyncHandler = {
  name: "Poligraph - Analyse IA Presse (affaires judiciaires)",
  description:
    "Analyse les articles de presse avec Claude Haiku pour détecter les affaires judiciaires",

  options: [
    {
      name: "--feed",
      type: "string",
      description: "Analyser un seul feed (mediapart, lemonde, lefigaro, franceinfo...)",
    },
    {
      name: "--politician",
      type: "string",
      description: "Articles mentionnant un politicien (par slug)",
    },
    {
      name: "--reanalyze",
      type: "boolean",
      description: "Ré-analyser les articles déjà traités",
    },
  ],

  showHelp() {
    console.log(`
Poligraph - Analyse IA Presse (affaires judiciaires)

Analyse les articles de presse avec Claude Haiku pour détecter les affaires
judiciaires. Enrichit les affaires existantes avec des sources presse ou en
crée de nouvelles (préfixées [À VÉRIFIER]).

Sources en accès libre (franceinfo, libé, LCP, Public Sénat, Politico) :
scrape du contenu. Autres sources : analyse sur titre+description RSS.

Le contenu scrappé n'est PAS stocké (copyright). Seuls le résumé IA et les
faits extraits sont conservés.

Options:
  --stats              Afficher les statistiques actuelles
  --dry-run            Preview sans écriture en base
  --limit=N            Limiter à N articles
  --feed=source        Un seul feed (mediapart, lemonde, lefigaro, franceinfo, liberation, politico, publicsenat, lcp)
  --politician=slug    Articles mentionnant ce politicien
  --reanalyze          Ré-analyser les articles déjà analysés
  --force              Ignorer l'intervalle minimum entre syncs (6h)
  --verbose            Sortie détaillée
  --help               Afficher cette aide

Environment:
  ANTHROPIC_API_KEY       Requis. Clé API Anthropic pour Claude Haiku
    `);
  },

  async showStats() {
    await getPressAnalysisStats();
  },

  async sync(options): Promise<SyncResult> {
    const {
      dryRun = false,
      force = false,
      limit,
      feed: feedSource,
      politician: politicianSlug,
      reanalyze = false,
      verbose = false,
    } = options as {
      dryRun?: boolean;
      force?: boolean;
      limit?: number;
      feed?: string;
      politician?: string;
      reanalyze?: boolean;
      verbose?: boolean;
    };

    const stats = await syncPressAnalysis({
      dryRun,
      force,
      limit,
      feedSource,
      politicianSlug,
      reanalyze,
      verbose,
    });

    return {
      success: isPressAnalysisSuccessful(stats),
      duration: 0,
      stats: {
        articlesProcessed: stats.articlesProcessed,
        articlesAnalyzed: stats.articlesAnalyzed,
        articlesAffairRelated: stats.articlesAffairRelated,
        affairsEnriched: stats.affairsEnriched,
        affairsCreated: stats.affairsCreated,
        affairsRejected: stats.affairsRejected,
        scrapeErrors: stats.scrapeErrors,
        analysisErrors: stats.analysisErrors,
        sensitiveWarnings: stats.sensitiveWarnings,
        quotaStopped: stats.quotaStopped ? 1 : 0,
      },
      errors: [],
    };
  },
};

createCLI(handler);
