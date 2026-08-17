/**
 * Affair Enrichment Service
 *
 * Enriches thin/rejected affairs by searching the web for corroborating press sources,
 * scraping article content, and using Claude Sonnet 4.5 to extract structured data.
 *
 * IMPORTANT: Enriched affairs ALWAYS go to NEEDS_REVIEW — never auto-publish.
 * This is a deliberate safety choice: the human validates the enriched data.
 */

import { db } from "@/lib/db";
import type { Prisma, AffairStatus, AffairCategory } from "@/generated/prisma";
import {
  searchBrave,
  buildAffairSearchQuery,
  type BraveSearchResult,
} from "@/lib/api/brave-search";
import { AFFAIR_STATUSES, AFFAIR_CATEGORIES } from "./affair-moderation";
import { createSilentJSDOM } from "@/lib/parsing/jsdom-silent";
import { Readability } from "@mozilla/readability";
import { invalidateEntity } from "@/lib/cache";
import { extractDateFromUrl } from "@/lib/extract-date-from-url";
import { removeSidebarElements } from "@/lib/parsing/html-utils";
import { callAnthropic, extractToolUse } from "@/lib/api/anthropic";
import { USER_AGENT } from "@/config/site";

const MODEL = "claude-sonnet-4-5-20250929";
const MAX_TOKENS = 2000;
const MAX_SCRAPE_LENGTH = 12_000;

// ============================================
// TYPES
// ============================================

export interface EnrichmentResult {
  enriched: boolean;
  affairId: string;
  sourcesFound: number;
  sourcesAdded: number;
  /** Summary of what changed */
  changes: string[];
  reasoning: string;
}

interface ScrapedArticle {
  url: string;
  title: string;
  publisher: string;
  textContent: string;
}

interface AIEnrichmentOutput {
  enriched_title: string;
  enriched_description: string;
  corrected_status: string | null;
  corrected_category: string | null;
  sentence_details: {
    prison_months?: number;
    fine_amount?: number;
    ineligibility_months?: number;
    community_service?: number;
    other?: string;
  } | null;
  facts_date: string | null;
  verdict_date: string | null;
  court: string | null;
  confidence: number;
  reasoning: string;
  sources_used: {
    url: string;
    title: string;
    publisher: string;
    published_date: string | null;
  }[];
}

// ============================================
// TOOL DEFINITION
// ============================================

const ENRICHMENT_TOOL = {
  name: "enrich_affair",
  description:
    "Enrichit une affaire judiciaire à partir d'articles de presse trouvés sur le web. " +
    "Extrais uniquement les faits vérifiables mentionnés dans les articles fournis.",
  input_schema: {
    type: "object" as const,
    properties: {
      enriched_title: {
        type: "string",
        description:
          "Titre enrichi de l'affaire. Format: 'Condamnation de X pour Y' ou 'Affaire X'. " +
          "Ne PAS inclure '[À VÉRIFIER]'. Doit être factuel et précis.",
      },
      enriched_description: {
        type: "string",
        description:
          "Description enrichie (3-5 phrases). Inclure: les faits, la procédure, " +
          "la peine si applicable, et le contexte politique. Ton neutre et factuel.",
      },
      corrected_status: {
        type: "string",
        enum: [...AFFAIR_STATUSES],
        description:
          "Statut judiciaire corrigé d'après les articles. " +
          "CONDAMNATION_DEFINITIVE UNIQUEMENT si l'article confirme explicitement " +
          "que le pourvoi a été rejeté ou les délais d'appel expirés. " +
          "En cas de doute, utiliser CONDAMNATION_PREMIERE_INSTANCE.",
      },
      corrected_category: {
        type: "string",
        enum: [...AFFAIR_CATEGORIES],
        description: "Catégorie corrigée si les articles permettent de préciser.",
      },
      sentence_details: {
        type: "object",
        properties: {
          prison_months: {
            type: "integer",
            description: "Peine de prison en mois (0 si pas de prison)",
          },
          fine_amount: {
            type: "number",
            description: "Montant de l'amende en euros",
          },
          ineligibility_months: {
            type: "integer",
            description: "Durée d'inéligibilité en mois",
          },
          community_service: {
            type: "integer",
            description: "Travail d'intérêt général en heures",
          },
          other: {
            type: "string",
            description: "Autres peines (interdictions, obligations, etc.)",
          },
        },
        description:
          "Détail de la peine prononcée si disponible dans les articles. null si pas de peine mentionnée.",
      },
      facts_date: {
        type: "string",
        description: "Date des faits au format YYYY-MM-DD si mentionnée. null sinon.",
      },
      verdict_date: {
        type: "string",
        description: "Date du verdict/condamnation au format YYYY-MM-DD si mentionnée. null sinon.",
      },
      court: {
        type: "string",
        description:
          "Juridiction (ex: 'Tribunal correctionnel de Paris', 'Cour d'appel de Versailles'). null si non mentionnée.",
      },
      confidence: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description:
          "Confiance dans l'enrichissement (0-100). " +
          "Haute (80+) si les articles confirment clairement l'affaire et le politicien. " +
          "Basse (<50) si doute sur le lien article/affaire ou homonymie possible.",
      },
      reasoning: {
        type: "string",
        description: "Explication du raisonnement et des sources utilisées.",
      },
      sources_used: {
        type: "array",
        items: {
          type: "object",
          properties: {
            url: { type: "string" },
            title: {
              type: "string",
              description:
                "Le titre EXACT de l'article de presse (tel qu'affiché sur le site du journal), " +
                "PAS le titre de l'affaire. Chaque article a un titre unique.",
            },
            publisher: { type: "string" },
            published_date: {
              type: "string",
              description: "Date de publication au format YYYY-MM-DD si connue. null sinon.",
            },
          },
          required: ["url", "title", "publisher"],
        },
        description: "Sources de presse utilisées pour l'enrichissement.",
      },
    },
    required: ["enriched_title", "enriched_description", "confidence", "reasoning", "sources_used"],
  },
};

const SYSTEM_PROMPT = `Tu es un assistant spécialisé dans l'enrichissement de fiches d'affaires judiciaires politiques pour Poligraph, un site citoyen de transparence politique.

MISSION : À partir d'articles de presse fournis, enrichir une fiche d'affaire judiciaire existante avec des données factuelles vérifiables.

RÈGLES STRICTES :
1. N'extrais QUE les informations présentes dans les articles fournis — ne JAMAIS inventer
2. Présomption d'innocence : pour les mises en examen, utiliser le conditionnel et rappeler la présomption
3. CONDAMNATION_DEFINITIVE uniquement si l'article confirme explicitement que l'appel est épuisé ou que le jugement est définitif. En cas de doute → CONDAMNATION_PREMIERE_INSTANCE
4. Vérifie que les articles parlent bien du MÊME politicien et de la MÊME affaire (attention aux homonymes et aux affaires multiples)
5. Si les articles ne confirment PAS l'affaire ou parlent d'une autre personne/affaire : confidence < 30
6. Ton neutre et factuel, pas de jugement moral

FORMAT DU TITRE :
- "Condamnation de [Prénom Nom] pour [motif]" si condamnation
- "Mise en examen de [Prénom Nom] pour [motif]" si mise en examen
- "Affaire [nom de l'affaire]" pour les affaires nommées
- JAMAIS de "[À VÉRIFIER]" dans le titre`;

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Enrich a rejected affair by searching the web for press sources.
 *
 * Flow:
 * 1. Load affair + politician data
 * 2. Search Brave for press articles
 * 3. Scrape top articles
 * 4. Call Sonnet to extract structured data
 * 5. Update affair in DB (add sources, enrich description)
 * 6. Update ModerationReview → NEEDS_REVIEW
 *
 * @returns EnrichmentResult with what was found and changed
 */
export async function enrichAffair(affairId: string): Promise<EnrichmentResult> {
  // 1. Load affair
  const affair = await db.affair.findUnique({
    where: { id: affairId },
    include: {
      politician: { select: { fullName: true, slug: true } },
      sources: { select: { url: true } },
      moderationReviews: {
        where: { appliedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!affair) {
    return {
      enriched: false,
      affairId,
      sourcesFound: 0,
      sourcesAdded: 0,
      changes: [],
      reasoning: "Affair not found",
    };
  }

  // 2. Search Brave
  const query = buildAffairSearchQuery(affair.politician.fullName, affair.title);
  let searchResults: BraveSearchResult[];

  try {
    searchResults = await searchBrave(query);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      enriched: false,
      affairId,
      sourcesFound: 0,
      sourcesAdded: 0,
      changes: [],
      reasoning: `Search failed: ${msg}`,
    };
  }

  if (searchResults.length === 0) {
    return {
      enriched: false,
      affairId,
      sourcesFound: 0,
      sourcesAdded: 0,
      changes: [],
      reasoning: "No trusted press sources found",
    };
  }

  // 3. Scrape top 2 articles (skip URLs already in sources)
  const existingUrls = new Set(affair.sources.map((s) => s.url));
  const newResults = searchResults.filter((r) => !existingUrls.has(r.url));

  if (newResults.length === 0) {
    return {
      enriched: false,
      affairId,
      sourcesFound: searchResults.length,
      sourcesAdded: 0,
      changes: [],
      reasoning: "All found sources already linked to affair",
    };
  }

  const scraped = await scrapeTopArticles(newResults.slice(0, 3));

  // Build article context for AI (scraped content + snippets for unscraped)
  const articleContexts: string[] = [];
  for (const article of scraped) {
    articleContexts.push(
      `--- Article (${article.publisher}) ---\nURL: ${article.url}\nTitre: ${article.title}\n\n${article.textContent}\n---`
    );
  }
  // Add Brave snippets for articles we couldn't scrape
  const scrapedUrls = new Set(scraped.map((a) => a.url));
  for (const result of newResults.slice(0, 5)) {
    if (!scrapedUrls.has(result.url) && result.publisher) {
      articleContexts.push(
        `--- Extrait (${result.publisher}) ---\nURL: ${result.url}\nTitre: ${result.title}\nExtrait: ${result.description}\n---`
      );
    }
  }

  if (articleContexts.length === 0) {
    return {
      enriched: false,
      affairId,
      sourcesFound: searchResults.length,
      sourcesAdded: 0,
      changes: [],
      reasoning: "Could not scrape any articles",
    };
  }

  // 4. Call Sonnet for extraction
  const aiResult = await callEnrichmentAI(
    affair.politician.fullName,
    affair.title,
    affair.description,
    affair.status,
    affair.category,
    articleContexts
  );

  if (!aiResult || aiResult.confidence < 40) {
    return {
      enriched: false,
      affairId,
      sourcesFound: searchResults.length,
      sourcesAdded: 0,
      changes: [],
      reasoning: aiResult
        ? `AI confidence too low (${aiResult.confidence}%): ${aiResult.reasoning}`
        : "AI extraction failed",
    };
  }

  // 5. Update affair in DB
  const changes: string[] = [];
  const affairUpdate: Prisma.AffairUncheckedUpdateInput = {};

  if (aiResult.enriched_title && aiResult.enriched_title !== affair.title) {
    affairUpdate.title = aiResult.enriched_title;
    changes.push(`Titre: "${affair.title}" → "${aiResult.enriched_title}"`);
  }

  if (aiResult.enriched_description && aiResult.enriched_description !== affair.description) {
    affairUpdate.description = aiResult.enriched_description;
    changes.push("Description enrichie");
  }

  if (aiResult.corrected_status && aiResult.corrected_status !== affair.status) {
    const validStatus = AFFAIR_STATUSES.includes(
      aiResult.corrected_status as (typeof AFFAIR_STATUSES)[number]
    );
    if (validStatus) {
      affairUpdate.status = aiResult.corrected_status as AffairStatus;
      changes.push(`Statut: ${affair.status} → ${aiResult.corrected_status}`);
    }
  }

  if (aiResult.corrected_category && aiResult.corrected_category !== affair.category) {
    const validCategory = AFFAIR_CATEGORIES.includes(
      aiResult.corrected_category as (typeof AFFAIR_CATEGORIES)[number]
    );
    if (validCategory) {
      affairUpdate.category = aiResult.corrected_category as AffairCategory;
      changes.push(`Catégorie: ${affair.category} → ${aiResult.corrected_category}`);
    }
  }

  // Sentence details
  if (aiResult.sentence_details) {
    const sd = aiResult.sentence_details;
    if (sd.prison_months != null) {
      affairUpdate.prisonMonths = sd.prison_months;
      changes.push(`Prison: ${sd.prison_months} mois`);
    }
    // The firm/suspended split is deliberately NOT emitted by the model, and nothing
    // replaces the boolean that used to be (#576). This function writes with
    // db.affair.update() and only then asks for a review, and its admin route does not
    // filter on publicationStatus, so an unreviewed model value can sit on a published
    // fiche about a named person. A human enters the split; the model's reading survives
    // in the prose it already writes.
    if (sd.fine_amount != null) {
      affairUpdate.fineAmount = sd.fine_amount;
      changes.push(`Amende: ${sd.fine_amount}€`);
    }
    if (sd.ineligibility_months != null) {
      affairUpdate.ineligibilityMonths = sd.ineligibility_months;
      changes.push(`Inéligibilité: ${sd.ineligibility_months} mois`);
    }
    if (sd.community_service != null) {
      affairUpdate.communityService = sd.community_service;
    }
    if (sd.other) {
      affairUpdate.otherSentence = sd.other;
    }
  }

  // Dates
  if (aiResult.facts_date) {
    const d = new Date(aiResult.facts_date);
    if (!isNaN(d.getTime())) {
      affairUpdate.factsDate = d;
      changes.push(`Date des faits: ${aiResult.facts_date}`);
    }
  }
  if (aiResult.verdict_date) {
    const d = new Date(aiResult.verdict_date);
    if (!isNaN(d.getTime())) {
      affairUpdate.verdictDate = d;
      changes.push(`Date verdict: ${aiResult.verdict_date}`);
    }
  }
  if (aiResult.court) {
    affairUpdate.court = aiResult.court;
    changes.push(`Tribunal: ${aiResult.court}`);
  }

  // Build title lookup from scraped articles and Brave results (more reliable than AI-returned titles)
  const titleByUrl = new Map<string, string>();
  for (const article of scraped) {
    titleByUrl.set(article.url, article.title);
  }
  for (const result of newResults) {
    if (!titleByUrl.has(result.url)) {
      titleByUrl.set(result.url, result.title);
    }
  }

  // Add new sources (validate dates to avoid Invalid Date errors)
  const sourcesToAdd = aiResult.sources_used
    .filter((s) => !existingUrls.has(s.url))
    .map((s) => {
      const parsedDate = s.published_date ? new Date(s.published_date) : null;
      const publishedAt =
        parsedDate && !isNaN(parsedDate.getTime())
          ? parsedDate
          : (extractDateFromUrl(s.url) ?? new Date());
      // Prefer real article title from scraping/Brave over AI-generated title
      const realTitle = titleByUrl.get(s.url) || s.title;
      return {
        url: s.url,
        title: realTitle,
        publisher: s.publisher,
        publishedAt,
        sourceType: "PRESSE" as const,
        affairId,
      };
    });

  // Apply updates in a transaction
  await db.$transaction(async (tx) => {
    if (Object.keys(affairUpdate).length > 0) {
      await tx.affair.update({
        where: { id: affairId },
        data: affairUpdate,
      });
    }

    // Add sources
    if (sourcesToAdd.length > 0) {
      await tx.source.createMany({ data: sourcesToAdd });
      changes.push(`${sourcesToAdd.length} source(s) presse ajoutée(s)`);
    }

    // Update or create ModerationReview → NEEDS_REVIEW
    const existingReview = affair.moderationReviews[0];
    if (existingReview) {
      await tx.moderationReview.update({
        where: { id: existingReview.id },
        data: {
          recommendation: "NEEDS_REVIEW",
          confidence: aiResult.confidence,
          reasoning: `[ENRICHI] ${aiResult.reasoning}`,
          suggestedTitle: aiResult.enriched_title,
          suggestedDescription: aiResult.enriched_description,
          suggestedStatus: aiResult.corrected_status ? (aiResult.corrected_status as never) : null,
          suggestedCategory: aiResult.corrected_category
            ? (aiResult.corrected_category as never)
            : null,
          model: `${MODEL} (enrichment)`,
        },
      });
    } else {
      await tx.moderationReview.create({
        data: {
          affairId,
          recommendation: "NEEDS_REVIEW",
          confidence: aiResult.confidence,
          reasoning: `[ENRICHI] ${aiResult.reasoning}`,
          suggestedTitle: aiResult.enriched_title,
          suggestedDescription: aiResult.enriched_description,
          suggestedStatus: aiResult.corrected_status ? (aiResult.corrected_status as never) : null,
          suggestedCategory: aiResult.corrected_category
            ? (aiResult.corrected_category as never)
            : null,
          model: `${MODEL} (enrichment)`,
          issues: [
            {
              type: "ENRICHED_FROM_WEB",
              detail: `Enrichi via ${sourcesToAdd.length} source(s) presse`,
            },
          ],
        },
      });
    }

    // Audit log
    await tx.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "Affair",
        entityId: affairId,
        changes: {
          source: "auto-enrichment",
          confidence: aiResult.confidence,
          sourcesAdded: sourcesToAdd.length,
          ...affairUpdate,
        } as Prisma.InputJsonValue,
      },
    });
  });

  // invalidateEntity uses revalidatePath which only works inside Next.js server context.
  // In standalone scripts, this is a no-op.
  try {
    invalidateEntity("affair");
  } catch {
    // Expected outside Next.js (e.g. in sync scripts)
  }

  return {
    enriched: true,
    affairId,
    sourcesFound: searchResults.length,
    sourcesAdded: sourcesToAdd.length,
    changes,
    reasoning: aiResult.reasoning,
  };
}

// ============================================
// SCRAPING
// ============================================

async function scrapeTopArticles(results: BraveSearchResult[]): Promise<ScrapedArticle[]> {
  const articles: ScrapedArticle[] = [];

  for (const result of results) {
    if (!result.publisher) continue;

    try {
      const response = await fetch(result.url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) continue;

      const html = await response.text();
      const dom = createSilentJSDOM(html, { url: result.url });
      removeSidebarElements(dom.window.document);
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (article?.textContent && article.textContent.trim().length > 200) {
        articles.push({
          url: result.url,
          title: article.title || result.title,
          publisher: result.publisher,
          textContent: article.textContent.replace(/\s+/g, " ").trim().slice(0, MAX_SCRAPE_LENGTH),
        });
      }
    } catch {
      // Scraping failed — skip this article, we'll use Brave snippet instead
    }
  }

  return articles;
}

// ============================================
// AI EXTRACTION
// ============================================

async function callEnrichmentAI(
  politicianName: string,
  currentTitle: string,
  currentDescription: string,
  currentStatus: string,
  currentCategory: string,
  articleContexts: string[]
): Promise<AIEnrichmentOutput | null> {
  const userMessage = `AFFAIRE À ENRICHIR :
- Politicien : ${politicianName}
- Titre actuel : ${currentTitle}
- Description actuelle : ${currentDescription}
- Statut actuel : ${currentStatus}
- Catégorie actuelle : ${currentCategory}

ARTICLES DE PRESSE TROUVÉS :

${articleContexts.join("\n\n")}

INSTRUCTIONS :
1. Vérifie que les articles parlent bien de ${politicianName} et de cette affaire spécifique
2. Extrais les informations factuelles : peine, dates, tribunal, détails
3. Rédige un titre précis et une description enrichie (3-5 phrases)
4. Corrige le statut si nécessaire (attention : CONDAMNATION_DEFINITIVE seulement si explicitement confirmé)
5. Indique ta confiance : haute si correspondance claire, basse si doute`;

  const data = await callAnthropic([{ role: "user", content: userMessage }], {
    model: MODEL,
    maxTokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    tools: [ENRICHMENT_TOOL],
    toolChoice: { type: "tool", name: "enrich_affair" },
  });

  const toolInput = extractToolUse(data);

  if (!toolInput) {
    return null;
  }

  return toolInput as AIEnrichmentOutput;
}
