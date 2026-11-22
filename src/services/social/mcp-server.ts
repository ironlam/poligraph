import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import { SOCIAL_CATEGORIES } from "@/lib/social/config";
import { createSocialDraft, listSocialPosts, rejectSocialPost } from "@/lib/social/drafts";
import { validateBlueskyText, validateXText } from "@/lib/social/validation";
import { checkSocialAccounts, getDailyCap, publishSocialPost } from "./publish";

const SERVER_INSTRUCTIONS = `Publication des comptes Poligraph sur X et Bluesky.
Flux : social_creer_brouillon, puis montrer les textes à l'humain, puis social_publier après son accord explicite.
Le serveur stocke et publie, il n'écrit rien : chaque texte vient de la conversation.
Règles éditoriales Poligraph : faits sourcés uniquement, non partisan, présomption d'innocence, jamais de tiret cadratin.
X : pas de lien dans le texte (coût et portée), ton direct. Bluesky : explicatif, lien vers poligraph.fr bienvenu.
Catégorie « affaires » : publication seulement après approbation dans /admin/social.
En cas d'échec, lire le diagnostic (code, action) et le transmettre tel quel à l'humain.`;

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function result(payload: unknown, isError = false): ToolResult {
  const content = [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }];
  return isError ? { content, isError: true } : { content };
}

/** Builds one server per request: the endpoint is stateless, like the rest of the API. */
export function createSocialMcpServer(context: { actor: string }): McpServer {
  const server = new McpServer(
    { name: "poligraph-social", version: "1.0.0" },
    { instructions: SERVER_INSTRUCTIONS }
  );

  server.registerTool(
    "social_verifier_comptes",
    {
      title: "Vérifier les comptes X et Bluesky",
      description:
        "Teste les identifiants X et Bluesky sans rien publier. Renvoie, par réseau, ok et le compte, ou un diagnostic (code, message, action) qui dit si les clés sont expirées, sans droit d'écriture, sans crédits, etc.",
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      const checks = await checkSocialAccounts();
      return result(
        { comptes: checks, plafondQuotidien: getDailyCap() },
        checks.some((check) => !check.ok)
      );
    }
  );

  server.registerTool(
    "social_creer_brouillon",
    {
      title: "Créer un brouillon",
      description:
        "Enregistre un brouillon avec un texte par réseau (au moins un). Ne publie rien. Les textes sont vérifiés (longueur, lien sur X) et les problèmes renvoyés sans enregistrer.",
      inputSchema: z.object({
        categorie: z.enum(SOCIAL_CATEGORIES).describe("Rubrique éditoriale du post."),
        texteBluesky: z
          .string()
          .optional()
          .describe("Texte Bluesky, 300 caractères maximum, lien poligraph.fr possible."),
        texteX: z.string().optional().describe("Texte X, sans lien."),
        autoriserLienX: z
          .boolean()
          .optional()
          .describe("Accepter un lien dans le texte X (0,20 $ au lieu de 0,015 $)."),
        entityId: z
          .string()
          .max(64)
          .optional()
          .describe("Identifiant Poligraph de l'objet traité, pour éviter les doublons."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ categorie, texteBluesky, texteX, autoriserLienX, entityId }) => {
      const bluesky = texteBluesky?.trim() || undefined;
      const x = texteX?.trim() || undefined;
      if (!bluesky && !x) return result({ erreur: "Au moins un texte est requis." }, true);

      const problems = [
        ...(bluesky ? validateBlueskyText(bluesky) : []),
        ...(x ? validateXText(x, { allowLink: autoriserLienX }) : []),
      ];
      if (problems.length > 0)
        return result({ erreur: "Texte refusé.", problemes: problems }, true);

      const draft = await createSocialDraft({
        category: categorie,
        blueskyText: bluesky,
        xText: x,
        entityId,
      });
      return result({ brouillon: draft });
    }
  );

  server.registerTool(
    "social_lister",
    {
      title: "Lister les posts",
      description: "Liste les brouillons et les posts récents, du plus récent au plus ancien.",
      inputSchema: z.object({
        statut: z.enum(["PENDING_REVIEW", "APPROVED", "POSTED", "REJECTED", "FAILED"]).optional(),
        limite: z.number().int().min(1).max(50).default(10),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ statut, limite }) => {
      const posts = await listSocialPosts({ status: statut, limit: limite });
      return result({ posts });
    }
  );

  server.registerTool(
    "social_publier",
    {
      title: "Publier sur X et Bluesky",
      description:
        "Publie un brouillon existant. À n'appeler qu'après l'accord explicite de l'humain sur les textes. Chaque réseau réussit ou échoue séparément ; un réseau déjà publié est ignoré, ce qui permet de réessayer l'autre. Repasser autoriserLienX à true si le texte X contient un lien accepté au brouillon.",
      inputSchema: z.object({
        id: z.string().min(1).max(64),
        reseaux: z
          .array(z.enum(["bluesky", "x"]))
          .min(1)
          .max(2),
        autoriserLienX: z.boolean().optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ id, reseaux, autoriserLienX }) => {
      const outcome = await publishSocialPost(id, reseaux, {
        allowLinkOnX: autoriserLienX,
        actor: context.actor,
      });
      const failed = !outcome.ok || outcome.resultats.some((entry) => entry.statut === "echec");
      return result(outcome, failed);
    }
  );

  server.registerTool(
    "social_rejeter",
    {
      title: "Rejeter un brouillon",
      description: "Passe un brouillon non publié au statut REJECTED.",
      inputSchema: z.object({ id: z.string().min(1).max(64) }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ id }) => {
      const rejected = await rejectSocialPost(id);
      if (!rejected) return result({ erreur: "Brouillon introuvable ou déjà publié." }, true);
      return result({ brouillon: rejected });
    }
  );

  return server;
}
