import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { headers } from "next/headers";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { Prisma } from "@/generated/prisma";
import { searchSimilar, rerankResults, type SearchResult } from "@/services/embeddings";
import { db } from "@/lib/db";
import { getSystemPrompt } from "@/services/chat/systemPrompt";
import { matchPattern } from "@/services/chat/patterns";
import { searchDatabaseByKeywords } from "@/services/chat/keywords";
import {
  getPublicFactCheckSqlWhere,
  PUBLIC_POLITICIAN_PUBLICATION_STATUS,
} from "@/lib/api/public-contract";
import { getPublishedAffairSqlWhere } from "@/lib/affairs/public-filters";

// Runtime configuration for streaming
export const maxDuration = 30;

// ─── Rate limiting ──────────────────────────────────────────────

let ratelimit: Ratelimit | null = null;

function getRatelimit(): Ratelimit | null {
  if (ratelimit) return ratelimit;

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!redisUrl || !redisToken) {
    console.warn("Upstash Redis not configured, rate limiting disabled");
    return null;
  }

  const redis = new Redis({
    url: redisUrl,
    token: redisToken,
  });

  ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "1 m"),
    analytics: true,
    prefix: "chat",
  });

  return ratelimit;
}

async function getClientIP(): Promise<string> {
  const headersList = await headers();
  const forwarded = headersList.get("x-forwarded-for");
  const realIP = headersList.get("x-real-ip");

  if (forwarded) {
    return forwarded.split(",")[0]!.trim();
  }
  if (realIP) {
    return realIP;
  }
  return "unknown";
}

// ─── Global stats for RAG context enrichment ────────────────────

async function getGlobalStats(): Promise<{
  totalAffairs: number;
  totalPoliticians: number;
  totalDossiers: number;
  totalVotes: number;
  totalDeputies: number;
  totalSenators: number;
  totalMEPs: number;
  totalMinisters: number;
  totalFactChecks: number;
  totalPressArticles: number;
}> {
  // Single SQL for all counts — prevents pool starvation (7 parallel queries → 1)
  const rows = await db.$queryRaw<
    [
      {
        total_affairs: bigint;
        total_politicians: bigint;
        total_dossiers: bigint;
        total_votes: bigint;
        total_factchecks: bigint;
        total_press_articles: bigint;
        total_deputies: bigint;
        total_senators: bigint;
        total_meps: bigint;
        total_ministers: bigint;
      },
    ]
  >(Prisma.sql`
    SELECT
      (SELECT COUNT(*) FROM "Affair" a
        WHERE ${getPublishedAffairSqlWhere()}
          AND EXISTS (
            SELECT 1 FROM "Politician" public_affair_politician
            WHERE public_affair_politician.id = a."politicianId"
              AND public_affair_politician."publicationStatus" = ${PUBLIC_POLITICIAN_PUBLICATION_STATUS}
          )) AS total_affairs,
      (SELECT COUNT(*) FROM "Politician" p
        WHERE p."publicationStatus" = ${PUBLIC_POLITICIAN_PUBLICATION_STATUS}) AS total_politicians,
      (SELECT COUNT(*) FROM "LegislativeDossier") AS total_dossiers,
      (SELECT COUNT(*) FROM "Scrutin") AS total_votes,
      (SELECT COUNT(*) FROM "FactCheck" fc
        WHERE ${getPublicFactCheckSqlWhere()}) AS total_factchecks,
      (SELECT COUNT(*) FROM "PressArticle") AS total_press_articles,
      (SELECT COUNT(*) FROM "Mandate" m
        JOIN "Politician" p ON m."politicianId" = p.id
        WHERE m."isCurrent" = true
          AND m."type" = 'DEPUTE'
          AND p."publicationStatus" = ${PUBLIC_POLITICIAN_PUBLICATION_STATUS}) AS total_deputies,
      (SELECT COUNT(*) FROM "Mandate" m
        JOIN "Politician" p ON m."politicianId" = p.id
        WHERE m."isCurrent" = true
          AND m."type" = 'SENATEUR'
          AND p."publicationStatus" = ${PUBLIC_POLITICIAN_PUBLICATION_STATUS}) AS total_senators,
      (SELECT COUNT(*) FROM "Mandate" m
        JOIN "Politician" p ON m."politicianId" = p.id
        WHERE m."isCurrent" = true
          AND m."type" = 'DEPUTE_EUROPEEN'
          AND p."publicationStatus" = ${PUBLIC_POLITICIAN_PUBLICATION_STATUS}) AS total_meps,
      (SELECT COUNT(*) FROM "Mandate" m
        JOIN "Politician" p ON m."politicianId" = p.id
        WHERE m."isCurrent" = true
          AND m."type" IN ('MINISTRE', 'MINISTRE_DELEGUE', 'SECRETAIRE_ETAT', 'PREMIER_MINISTRE')
          AND p."publicationStatus" = ${PUBLIC_POLITICIAN_PUBLICATION_STATUS}) AS total_ministers
  `);

  const r = rows[0];
  return {
    totalAffairs: Number(r.total_affairs),
    totalPoliticians: Number(r.total_politicians),
    totalDossiers: Number(r.total_dossiers),
    totalVotes: Number(r.total_votes),
    totalFactChecks: Number(r.total_factchecks),
    totalPressArticles: Number(r.total_press_articles),
    totalDeputies: Number(r.total_deputies),
    totalSenators: Number(r.total_senators),
    totalMEPs: Number(r.total_meps),
    totalMinisters: Number(r.total_ministers),
  };
}

// ─── Temporal boost for recency-aware ranking ───────────────────

const MAX_CONTEXT_LENGTH = 4000;

function applyTemporalBoost(results: SearchResult[]): SearchResult[] {
  const now = Date.now();
  const THREE_MONTHS = 90 * 24 * 60 * 60 * 1000;
  const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;
  const THREE_YEARS = 3 * ONE_YEAR;

  return results
    .map((r) => {
      const dateStr = (r.metadata?.votingDate as string) || (r.metadata?.publishedAt as string);

      if (!dateStr) return r;

      const age = now - new Date(dateStr).getTime();
      let boost = 1;
      if (age < THREE_MONTHS) boost = 1.5;
      else if (age < ONE_YEAR) boost = 1.2;
      else if (age > THREE_YEARS) boost = 0.7;

      return { ...r, similarity: r.similarity * boost };
    })
    .sort((a, b) => b.similarity - a.similarity);
}

// ─── Build context from RAG search results ──────────────────────

async function buildContext(results: SearchResult[], query: string): Promise<string> {
  if (results.length === 0) {
    return "Aucune information trouvée dans la base de données pour cette requête.";
  }

  const sections: string[] = [];
  const lowerQuery = query.toLowerCase();

  // Add global stats if query is broad
  const isBroadQuery =
    lowerQuery.includes("affaire") ||
    lowerQuery.includes("élu") ||
    lowerQuery.includes("député") ||
    lowerQuery.includes("sénateur") ||
    lowerQuery.includes("dossier") ||
    lowerQuery.includes("vote") ||
    lowerQuery.includes("fact") ||
    lowerQuery.includes("vérif") ||
    lowerQuery.includes("presse") ||
    lowerQuery.includes("article");

  if (isBroadQuery) {
    const stats = await getGlobalStats();
    let statsInfo = "STATISTIQUES OFFICIELLES:\n";

    if (lowerQuery.includes("député")) {
      statsInfo += `- NOMBRE DE DÉPUTÉS: ${stats.totalDeputies} députés à l'Assemblée nationale (577 sièges)\n`;
      statsInfo += `- Rubrique: /politiques?type=depute\n`;
    }
    if (lowerQuery.includes("sénateur")) {
      statsInfo += `- NOMBRE DE SÉNATEURS: ${stats.totalSenators} sénateurs au Sénat (348 sièges)\n`;
      statsInfo += `- Rubrique: /politiques?type=senateur\n`;
    }
    if (lowerQuery.includes("eurodéputé") || lowerQuery.includes("européen")) {
      statsInfo += `- NOMBRE D'EURODÉPUTÉS FRANÇAIS: ${stats.totalMEPs} (81 sièges pour la France)\n`;
    }
    if (lowerQuery.includes("ministre") || lowerQuery.includes("gouvernement")) {
      statsInfo += `- MEMBRES DU GOUVERNEMENT: ${stats.totalMinisters} ministres et secrétaires d'État\n`;
    }
    if (lowerQuery.includes("affaire")) {
      statsInfo += `- Total affaires judiciaires référencées: ${stats.totalAffairs}\n`;
      statsInfo += `- Rubrique complète: /affaires\n`;
    }
    if (
      lowerQuery.includes("dossier") ||
      lowerQuery.includes("loi") ||
      lowerQuery.includes("législat")
    ) {
      statsInfo += `- Total dossiers législatifs: ${stats.totalDossiers}\n`;
      statsInfo += `- Rubrique complète: /parlement/dossiers\n`;
    }
    if (lowerQuery.includes("vote") || lowerQuery.includes("scrutin")) {
      statsInfo += `- Total votes enregistrés: ${stats.totalVotes}\n`;
    }
    if (lowerQuery.includes("fact") || lowerQuery.includes("vérif")) {
      statsInfo += `- Fact-checks référencés: ${stats.totalFactChecks}\n`;
      statsInfo += `- Rubrique: /factchecks\n`;
    }
    if (lowerQuery.includes("presse") || lowerQuery.includes("article")) {
      statsInfo += `- Articles de presse référencés: ${stats.totalPressArticles}\n`;
      statsInfo += `- Rubrique: /presse\n`;
    }

    sections.push(statsInfo);
  }

  for (const result of results) {
    const metadata = result.metadata || {};
    let section = `[${result.entityType}] `;

    switch (result.entityType) {
      case "POLITICIAN":
        section += `**${metadata.name || "Inconnu"}**\n`;
        section += result.content;
        if (metadata.slug) {
          section += `\n→ Fiche complète: /politiques/${metadata.slug}`;
        }
        break;

      case "DOSSIER": {
        section += `**${metadata.title || "Dossier législatif"}**\n`;
        section += result.content;
        const dossierUrl = metadata.slug || metadata.id;
        if (dossierUrl) {
          section += `\n→ Voir ce dossier: /parlement/dossiers/${dossierUrl}`;
        }
        if (metadata.sourceUrl) {
          section += `\n→ Source officielle AN: ${metadata.sourceUrl}`;
        }
        break;
      }

      case "SCRUTIN": {
        section += `**Vote: ${metadata.title || "Scrutin"}**\n`;
        section += result.content;
        const scrutinUrl = metadata.slug || metadata.id;
        if (scrutinUrl) {
          section += `\n→ Voir ce vote: /parlement/votes/${scrutinUrl}`;
        }
        if (metadata.sourceUrl) {
          section += `\n→ Source officielle AN: ${metadata.sourceUrl}`;
        }
        break;
      }

      case "AFFAIR": {
        section += `**Affaire: ${metadata.title || "Affaire judiciaire"}**\n`;
        section += result.content;
        const politicianName = metadata.politicianName || "La personne concernée";
        section += `\n⚠️ Rappel: ${politicianName} bénéficie de la présomption d'innocence jusqu'à condamnation définitive.`;
        if (metadata.politicianSlug) {
          section += `\n→ Fiche: /politiques/${metadata.politicianSlug}`;
        }
        break;
      }

      case "PARTY":
        section += `**Parti: ${metadata.name || "Parti politique"}**\n`;
        section += result.content;
        if (metadata.slug) {
          section += `\n→ Page parti: /partis/${metadata.slug}`;
        }
        break;

      case "FACTCHECK":
        section += `**Fact-check: ${metadata.title || "Vérification"}**\n`;
        section += result.content;
        if (metadata.verdict) {
          section += `\nVerdict: ${metadata.verdict}`;
        }
        if (metadata.sourceUrl) {
          section += `\n→ Source: ${metadata.sourceUrl}`;
        }
        section += `\n→ Tous les fact-checks: /factchecks`;
        break;

      case "PRESS_ARTICLE":
        section += `**Article: ${metadata.title || "Article de presse"}**\n`;
        section += result.content;
        if (metadata.url) {
          section += `\n→ Lire l'article: ${metadata.url}`;
        }
        section += `\n→ Revue de presse: /presse`;
        break;

      default:
        section += result.content;
    }

    sections.push(section);
  }

  // Truncate context to avoid overwhelming the LLM
  let context = "";
  for (const section of sections) {
    const candidate = context ? `${context}\n\n---\n\n${section}` : section;
    if (candidate.length > MAX_CONTEXT_LENGTH) {
      // Add at least the first section even if it exceeds the limit
      if (!context) context = section;
      break;
    }
    context = candidate;
  }

  return context;
}

// ─── POST handler ───────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    // Rate limiting
    const limiter = getRatelimit();
    if (limiter) {
      const ip = await getClientIP();
      const { success, remaining, reset } = await limiter.limit(ip);

      if (!success) {
        return new Response(
          JSON.stringify({
            error: "Trop de requêtes. Veuillez réessayer dans quelques instants.",
            retryAfter: Math.ceil((reset - Date.now()) / 1000),
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "X-RateLimit-Remaining": remaining.toString(),
              "X-RateLimit-Reset": reset.toString(),
            },
          }
        );
      }
    }

    // Parse request
    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Messages requis" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get the last user message for RAG search
    const lastUserMessage = messages.filter((m: { role: string }) => m.role === "user").pop();

    if (!lastUserMessage) {
      return new Response(JSON.stringify({ error: "Aucun message utilisateur" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userQuery = lastUserMessage.content;

    // PRIORITY 0: Pattern matching (citizen-oriented direct answers)
    let context = await matchPattern(userQuery);

    // PRIORITY 1: Semantic RAG search with Voyage AI embeddings + reranking
    if (!context && process.env.VOYAGE_API_KEY) {
      try {
        const searchResults = await searchSimilar({
          query: userQuery,
          limit: 12,
          threshold: 0.4,
        });
        if (searchResults.length > 0) {
          let rankedResults = searchResults;
          try {
            rankedResults = await rerankResults(userQuery, searchResults, 8);
          } catch (rerankError) {
            console.error("Reranking error, using vector search order:", rerankError);
          }
          // Apply temporal boost to prioritize recent results
          rankedResults = applyTemporalBoost(rankedResults);
          context = await buildContext(rankedResults, userQuery);
        }
      } catch (error) {
        console.error("RAG search error:", error);
      }
    }

    // PRIORITY 2: Keyword-based database search
    if (!context) {
      context = await searchDatabaseByKeywords(userQuery);
    }

    // Fallback message
    if (!context) {
      context = "Aucune information trouvée pour cette requête.";
    }

    // Check for Anthropic API key
    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "Service temporairement indisponible. Veuillez réessayer plus tard.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build messages with context
    const messagesWithContext = [
      ...messages.slice(0, -1),
      {
        role: "user",
        content: `DONNÉES DE RÉFÉRENCE:\n${context}\n\nQUESTION DE L'UTILISATEUR:\n${userQuery}`,
      },
    ];

    // Stream response using Vercel AI SDK
    // Manual stream to catch API errors gracefully (toTextStreamResponse swallows them)
    const result = streamText({
      model: anthropic("claude-haiku-4-5-20251001"),
      system: getSystemPrompt(),
      messages: messagesWithContext,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let hasContent = false;
        try {
          for await (const chunk of result.textStream) {
            hasContent = true;
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (streamError) {
          const status = (streamError as { statusCode?: number })?.statusCode;
          console.error("Chat stream error:", { status, message: String(streamError) });
          const errorMsg = hasContent
            ? "\n\n[Réponse interrompue. Veuillez réessayer.]"
            : "L'assistant Poligraph est temporairement indisponible. Cette fonctionnalité sera de nouveau accessible prochainement.";
          controller.enqueue(encoder.encode(errorMsg));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("Chat API error:", error);

    return new Response(
      JSON.stringify({
        error: "Une erreur s'est produite. Veuillez réessayer.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// ─── Health check ───────────────────────────────────────────────

export async function GET() {
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasVoyage = !!process.env.VOYAGE_API_KEY;
  const hasUpstash = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

  return new Response(
    JSON.stringify({
      status: "ok",
      features: {
        chat: hasAnthropic,
        rag: hasVoyage,
        rateLimit: hasUpstash,
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
