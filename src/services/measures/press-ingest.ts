import { db } from "@/lib/db";
import { createMeasure, type CreateMeasureInput } from "@/lib/measures/transitions";
import { PRESIDENTIELLE_2027_SLUG } from "@/lib/presidentielle/themes";
import { extractPromisesFromText } from "@/services/promises/extractor";
import { classifyPresidentialTheme, classifyTheme } from "@/services/promises/theme-classifier";

/**
 * Extracting campaign measures from press articles.
 *
 * Replaces `ingestPromisesFromPress`, which wrote a flat `Promise` row. The pipeline now produces a
 * measure, its first revision and its source, all in draft: nothing it writes is publishable without a
 * human review, which is the whole point of the versioned model.
 *
 * **It takes an election, and that is not a parameter of convenience.** `Measure` belongs to a
 * campaign, and a press article about a politician says nothing about which one. So the caller names
 * the election, and only politicians who are candidates in it produce measures. The others are
 * counted and reported rather than attached to a campaign nobody chose.
 *
 * The `promiseScanStatus` / `promiseScanAt` columns of `PressArticle` are reused as they are: renaming
 * them is a schema change with no editorial value, and it would have to wait for a deployment.
 */

interface IngestOptions {
  electionId: string;
  limit?: number;
  dryRun?: boolean;
}

export interface MeasureIngestResult {
  scanned: number;
  extracted: number;
  created: number;
  /** Mentions skipped because the politician is not a candidate in the target election. */
  skippedNotCandidate: number;
}

export async function ingestMeasuresFromPress(opts: IngestOptions): Promise<MeasureIngestResult> {
  const limit = opts.limit ?? 50;

  const election = await db.election.findUnique({
    where: { id: opts.electionId },
    select: { id: true, slug: true },
  });
  if (election === null) {
    throw new Error(`Élection ${opts.electionId} introuvable`);
  }

  const candidacies = await db.candidacy.findMany({
    where: { electionId: opts.electionId, politicianId: { not: null } },
    select: { id: true, politicianId: true },
  });
  const candidacyByPolitician = new Map(
    candidacies.flatMap((c) => (c.politicianId === null ? [] : [[c.politicianId, c.id] as const]))
  );

  const articles = await db.pressArticle.findMany({
    where: { mentions: { some: {} }, promiseScanStatus: null },
    include: { mentions: { include: { politician: true } } },
    take: limit,
    orderBy: { publishedAt: "desc" },
  });

  const result: MeasureIngestResult = {
    scanned: articles.length,
    extracted: 0,
    created: 0,
    skippedNotCandidate: 0,
  };

  for (const article of articles) {
    let articleHadHit = false;
    let articleErrored = false;

    try {
      const plannedMeasures: CreateMeasureInput[] = [];

      for (const mention of article.mentions) {
        const candidacyId = candidacyByPolitician.get(mention.politicianId);
        if (candidacyId === undefined) {
          result.skippedNotCandidate += 1;
          continue;
        }

        const candidates = await extractPromisesFromText({
          text: `${article.title}\n\n${article.description ?? ""}`,
          politicianName: mention.politician.fullName,
        });
        result.extracted += candidates.length;
        articleHadHit = articleHadHit || candidates.length > 0;

        if (opts.dryRun) continue;

        for (const candidate of candidates) {
          const classification =
            election.slug === PRESIDENTIELLE_2027_SLUG
              ? await classifyPresidentialTheme(candidate.text)
              : await classifyTheme(candidate.text);
          if (classification === null) {
            throw new Error("La mesure n'a pas pu être classée dans la taxonomie présidentielle");
          }
          plannedMeasures.push({
            politicianId: mention.politicianId,
            electionId: opts.electionId,
            candidacyId,
            programEditionId: null,
            attribution: "PERSONAL",
            theme: classification.theme,
            precedingMeasureId: null,
            revision: {
              text: candidate.text,
              // No precision guessed from the text: that is an editorial conclusion, and an extractor
              // is not entitled to draw it.
              precision: null,
              validFrom: article.publishedAt,
              extractionMethod: "AI_ASSISTED",
              extractionConfidence: candidate.confidence,
              extractorVersion: classification.method,
            },
            sources: [
              {
                // Press coverage is secondary by definition: it reports what the candidate said.
                sourceKind: "ARTICLE_PRESSE",
                tier: "SECONDARY",
                url: article.url,
                page: null,
                publishedAt: article.publishedAt,
              },
            ],
          });
        }
      }

      // Finish extraction and classification for the whole article before the first write. A
      // transient classifier failure must not leave a partial article import marked as failed.
      for (const input of plannedMeasures) {
        await createMeasure(input);
        result.created += 1;
      }
    } catch (err) {
      articleErrored = true;

      console.error(
        `[measures/press-ingest] Article ${article.id} (${article.url}) failed:`,
        err instanceof Error ? err.message : String(err)
      );
    }

    if (!opts.dryRun) {
      const status = articleErrored ? "error" : articleHadHit ? "scanned" : "skipped";
      await db.pressArticle.update({
        where: { id: article.id },
        data: { promiseScanStatus: status, promiseScanAt: new Date() },
      });
    }
  }

  return result;
}
