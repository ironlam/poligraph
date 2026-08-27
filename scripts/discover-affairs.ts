/**
 * CLI adapter for the shared Wikidata and Wikipedia affair discovery service.
 *
 * Keeping orchestration in src/services/sync/discover-affairs.ts guarantees that
 * CLI runs and Inngest runs use the same matcher inputs, resolver decisions,
 * enrichments, proposal previews, statistics and cursor rules.
 */
import "dotenv/config";
import { createCLI, type SyncHandler, type SyncResult } from "../src/lib/sync";
import { db } from "../src/lib/db";
import { discoverAffairs } from "../src/services/sync/discover-affairs";

const handler: SyncHandler = {
  name: "Poligraph - Découverte d’affaires (Wikidata + Wikipedia)",
  description: "Découvre les affaires judiciaires historiques via le service partagé avec Inngest",

  options: [
    {
      name: "--politician",
      type: "string",
      description: "Filtrer par nom de responsable politique (correspondance partielle)",
    },
    {
      name: "--wikidata-only",
      type: "boolean",
      description: "Exécuter la phase Wikidata uniquement",
    },
    {
      name: "--wikipedia-only",
      type: "boolean",
      description: "Exécuter la phase Wikipedia uniquement",
    },
  ],

  showHelp() {
    console.log(`
Poligraph - Découverte d’affaires judiciaires (Wikidata + Wikipedia)

Le CLI appelle le même service que le job Inngest. Le mode dry-run exécute les
mêmes décisions sans curseur, ImportRun, proposition, resolver ou brouillon écrit.

Options :
  --stats              Afficher les statistiques actuelles
  --dry-run            Prévisualiser sans sauvegarder
  --limit=N            Limiter à N responsables politiques
  --politician="Nom"   Filtrer par nom
  --wikidata-only      Exécuter Wikidata uniquement
  --wikipedia-only     Exécuter Wikipedia uniquement
  --force              Ignorer le curseur incrémental
  --verbose            Sortie détaillée du runner
  --help               Afficher cette aide

Environnement :
  ANTHROPIC_API_KEY    Requis pour l’extraction Wikipedia
    `);
  },

  async showStats() {
    const [totalPublished, withAffairs, withQid, totalAffairs, publishedAffairs, draftAffairs] =
      await Promise.all([
        db.politician.count({ where: { publicationStatus: "PUBLISHED" } }),
        db.politician.count({
          where: { publicationStatus: "PUBLISHED", affairs: { some: {} } },
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

    console.log("\n=== Statistiques Découverte d’affaires ===\n");
    console.log(`  Responsables publiés :            ${totalPublished}`);
    console.log(`  Responsables avec au moins une affaire : ${withAffairs}`);
    console.log(`  Responsables avec Q-ID Wikidata : ${withQid}`);
    console.log(`  Total affaires :                  ${totalAffairs}`);
    console.log(`  Publiées :                        ${publishedAffairs}`);
    console.log(`  Brouillons :                      ${draftAffairs}`);
    console.log("");
  },

  async sync(options): Promise<SyncResult> {
    const startedAt = Date.now();
    const result = await discoverAffairs({
      limit: options.limit as number | undefined,
      politicianFilter: options.politician as string | undefined,
      wikidataOnly: !!options.wikidataOnly,
      wikipediaOnly: !!options.wikipediaOnly,
      useCursor: !options.force,
      dryRun: !!options.dryRun,
    });
    const { errors, ...stats } = result;

    return {
      success: errors.length === 0,
      duration: (Date.now() - startedAt) / 1000,
      stats,
      errors,
    };
  },
};

createCLI(handler);
