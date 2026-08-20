import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Support PoliGraph",
  description:
    "Canaux publics pour signaler un problème technique, une erreur de donnée ou une vulnérabilité concernant PoliGraph.",
  alternates: { canonical: "/support" },
};

const SUPPORT_EMAIL = "contact@poligraph.fr";

export default function SupportPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-3 font-display text-3xl font-extrabold tracking-tight">
        Support PoliGraph
      </h1>
      <p className="mb-10 text-muted-foreground">
        Utilisez le canal adapté à votre demande. Ne publiez jamais une information sensible dans
        une issue ou un message accessible publiquement.
      </p>

      <div className="prose prose-gray max-w-none space-y-10">
        <section>
          <h2 className="mb-4 text-xl font-semibold">Problème technique</h2>
          <p className="text-muted-foreground">
            Écrivez à{" "}
            <a href={"mailto:" + SUPPORT_EMAIL} className="font-semibold underline">
              {SUPPORT_EMAIL}
            </a>
            . Pour faciliter le diagnostic, indiquez si possible :
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-foreground">
            <li>le client utilisé ;</li>
            <li>la date et l&apos;heure approximatives ;</li>
            <li>le tool concerné ;</li>
            <li>le résultat attendu ;</li>
            <li>le message d&apos;erreur ;</li>
            <li>l&apos;identifiant de requête uniquement s&apos;il est visible.</li>
          </ul>
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
            Ne transmettez jamais de mot de passe, token, clé API, cookie ou donnée confidentielle
            inutile au diagnostic.
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">
            Erreur de donnée ou demande de rectification
          </h2>
          <p className="text-muted-foreground">
            Précisez l&apos;URL ou la fiche concernée, l&apos;information contestée, une source de
            correction et le contexte factuel utile. Le droit de réponse et son canal sont décrits
            dans les{" "}
            <Link href="/mentions-legales" className="underline">
              mentions légales
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Vulnérabilité</h2>
          <p className="text-muted-foreground">
            N&apos;ouvrez pas d&apos;issue publique pour une vulnérabilité non corrigée. Écrivez à{" "}
            <a href={"mailto:" + SUPPORT_EMAIL} className="font-semibold underline">
              {SUPPORT_EMAIL}
            </a>{" "}
            et consultez la{" "}
            <a
              href="https://github.com/ironlam/poligraph-mcp/blob/main/SECURITY.md"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              politique de sécurité du serveur MCP
            </a>
            . Aucun programme de bug bounty ou engagement de safe harbor distinct n&apos;est
            annoncé.
          </p>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">GitHub Issues</h2>
          <p className="text-muted-foreground">
            Les{" "}
            <a
              href="https://github.com/ironlam/poligraph/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              issues publiques du dépôt PoliGraph
            </a>{" "}
            peuvent être utilisées uniquement pour les bugs non sensibles, les problèmes de
            documentation, les demandes d&apos;amélioration et les erreurs factuelles ne contenant
            aucune donnée sensible.
          </p>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Délais</h2>
          <p className="text-muted-foreground">
            Une réponse est apportée selon la nature et la priorité du signalement. Aucun délai
            général ni niveau de service contractuel n&apos;est promis. L&apos;engagement de 72
            heures ouvrées publié dans les mentions légales concerne uniquement les demandes de
            droit de réponse et de rectification qui y sont décrites.
          </p>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Liens utiles</h2>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            <li>
              <Link href="/confidentialite" className="underline">
                Politique de confidentialité
              </Link>
            </li>
            <li>
              <Link href="/conditions-utilisation" className="underline">
                Conditions d&apos;utilisation
              </Link>
            </li>
            <li>
              <Link href="/mentions-legales" className="underline">
                Mentions légales
              </Link>
            </li>
            <li>
              <a
                href="https://github.com/ironlam/poligraph"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Dépôt PoliGraph
              </a>
            </li>
            <li>
              <a
                href="https://github.com/ironlam/poligraph-mcp"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Dépôt poligraph-mcp
              </a>
            </li>
            <li>
              <a
                href="https://github.com/ironlam/poligraph-mcp/blob/main/SECURITY.md"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                SECURITY.md du serveur MCP
              </a>
            </li>
          </ul>
        </section>
      </div>

      <p className="mt-12 text-sm text-muted-foreground">Dernière mise à jour : Août 2026</p>
    </main>
  );
}
