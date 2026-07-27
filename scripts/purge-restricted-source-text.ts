/**
 * Retire le texte dérivé des sources dont l'accès est restreint, pour ne
 * conserver que le lien et les métadonnées (droit voisin, loi 2019-775).
 *
 * Deux colonnes portent du texte dérivé d'un article :
 *   1. Source.excerpt         — extrait cité sur la fiche affaire.
 *   2. PressArticle.aiSummary — résumé généré à partir de l'article.
 *
 * Une troisième surface s'y ajoute : ChatEmbedding reprend aiSummary pour le
 * RAG, sans clé étrangère vers PressArticle. Sans traitement, le chatbot
 * continuerait de restituer un texte retiré partout ailleurs.
 *
 * Seules ces colonnes sont remises à null. Les articles, URL, liens
 * élus/articles et affaires sont conservés : on garde la source, on ne
 * conserve pas la reproduction.
 *
 * SÉCURITÉ : dry-run par défaut. Aucune écriture sans --confirm explicite.
 *
 * Usage :
 *   npx dotenv -e .env -- npx tsx scripts/purge-restricted-source-text.ts
 *   npx dotenv -e .env -- npx tsx scripts/purge-restricted-source-text.ts --confirm
 */

import "dotenv/config";
import { db } from "../src/lib/db";

/**
 * Sources à accès restreint. Les deux formes servent à couvrir la casse
 * rencontrée en base : Source.publisher est un libellé, PressArticle
 * .feedSource un identifiant de flux.
 */
const RESTRICTED_PUBLISHERS = ["Mediapart", "mediapart"];
const RESTRICTED_FEEDS = ["mediapart"];

async function main() {
  const confirm = process.argv.includes("--confirm");

  console.log("\n=== Purge du texte dérivé des sources à accès restreint ===");
  console.log(
    confirm ? "MODE : APPLICATION RÉELLE\n" : "MODE : simulation (--confirm pour appliquer)\n"
  );

  const excerptWhere = {
    publisher: { in: RESTRICTED_PUBLISHERS },
    excerpt: { not: null },
  };
  const excerptCount = await db.source.count({ where: excerptWhere });

  const summaryWhere = {
    feedSource: { in: RESTRICTED_FEEDS },
    aiSummary: { not: null },
  };
  const summaryCount = await db.pressArticle.count({ where: summaryWhere });

  // Ciblé par entityId faute de clé étrangère entre ChatEmbedding et
  // PressArticle : sans cela, l'index RAG conserverait le texte.
  const restrictedArticleIds = (
    await db.pressArticle.findMany({
      where: { feedSource: { in: RESTRICTED_FEEDS } },
      select: { id: true },
    })
  ).map((a) => a.id);

  const embeddingCount =
    restrictedArticleIds.length > 0
      ? await db.chatEmbedding.count({
          where: { entityType: "PRESS_ARTICLE", entityId: { in: restrictedArticleIds } },
        })
      : 0;

  console.table({
    "Source.excerpt": excerptCount,
    "PressArticle.aiSummary": summaryCount,
    "ChatEmbedding (index RAG)": embeddingCount,
  });

  const total = excerptCount + summaryCount + embeddingCount;

  if (total === 0) {
    console.log("\n✓ Aucun texte dérivé à purger.");
    await db.$disconnect();
    return;
  }

  if (!confirm) {
    console.log(
      `\n[SIMULATION] ${total} enregistrement(s) seraient modifiés ou supprimés.\n` +
        "  - Source.excerpt et PressArticle.aiSummary : remis à null\n" +
        "  - ChatEmbedding : lignes supprimées (réindexables via index:embeddings)\n" +
        "  Les articles, URL, liens élus et affaires sont conservés.\n" +
        "  Relancez avec --confirm pour appliquer."
    );
    await db.$disconnect();
    return;
  }

  const excerpts = await db.source.updateMany({
    where: excerptWhere,
    data: { excerpt: null },
  });

  const summaries = await db.pressArticle.updateMany({
    where: summaryWhere,
    data: { aiSummary: null },
  });

  // Suppression plutôt que mise à null : content est non-nullable, et un
  // embedding vide fausserait la recherche vectorielle. La réindexation
  // (npm run index:embeddings) les reconstruira sur titre et métadonnées.
  const embeddings =
    restrictedArticleIds.length > 0
      ? await db.chatEmbedding.deleteMany({
          where: { entityType: "PRESS_ARTICLE", entityId: { in: restrictedArticleIds } },
        })
      : { count: 0 };

  await db.auditLog.create({
    data: {
      action: "UPDATE",
      entityType: "PressArticle",
      entityId: "bulk-purge-restricted-source-text",
      changes: {
        remediation: "restricted-source-text",
        sourceExcerptsCleared: excerpts.count,
        aiSummariesCleared: summaries.count,
        embeddingsDeleted: embeddings.count,
      },
    },
  });

  console.log(
    `\n✓ Purge effectuée :\n` +
      `  Source.excerpt vidés        : ${excerpts.count}\n` +
      `  PressArticle.aiSummary vidés: ${summaries.count}\n` +
      `  ChatEmbedding supprimés     : ${embeddings.count}`
  );
  console.log("\n  Relancez npm run index:embeddings pour réindexer sur titre + métadonnées.");

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
