import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Database, FileDown, Link2, ShieldCheck } from "lucide-react";
import { SwaggerUIWrapper } from "./_components/SwaggerUIWrapper";
import { QuickstartTabs } from "./_components/QuickstartTabs";
import { DataDictionary } from "./_components/DataDictionary";
import { CodeBlock } from "./_components/CodeBlock";

export const metadata: Metadata = {
  title: "Documentation API — données ouvertes Poligraph",
  description:
    "Guide complet pour utiliser les données publiques Poligraph (affaires judiciaires, politiques, fact-checks, votes) en Python, R ou curl. Exports CSV, pagination, dictionnaire des données et identifiants stables poligraphId.",
};

export const revalidate = 3600; // 1 hour — doc content is static, refresh hourly

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-5xl px-4 py-10">
        {/* Hero */}
        <header className="mb-12">
          <p className="text-sm font-mono text-muted-foreground uppercase tracking-wider mb-2">
            Documentation API
          </p>
          <h1 className="text-4xl font-display font-extrabold tracking-tight mb-4">
            Données ouvertes Poligraph
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl">
            Affaires judiciaires, politiques, fact-checks, votes parlementaires et élections. Tout
            ce que le site affiche est accessible en JSON et en CSV, sans clé API, pour vos
            recherches, cours et analyses.
          </p>
          <nav aria-label="Sommaire" className="mt-6 flex flex-wrap gap-2 text-sm">
            <a
              href="#quickstart"
              className="inline-flex items-center rounded-full border bg-card px-3 py-1 hover:bg-muted transition-colors"
            >
              Quickstart
            </a>
            <a
              href="#exports"
              className="inline-flex items-center rounded-full border bg-card px-3 py-1 hover:bg-muted transition-colors"
            >
              Exports CSV
            </a>
            <a
              href="#pagination"
              className="inline-flex items-center rounded-full border bg-card px-3 py-1 hover:bg-muted transition-colors"
            >
              Pagination
            </a>
            <a
              href="#poligraphid"
              className="inline-flex items-center rounded-full border bg-card px-3 py-1 hover:bg-muted transition-colors"
            >
              poligraphId
            </a>
            <a
              href="#dictionary"
              className="inline-flex items-center rounded-full border bg-card px-3 py-1 hover:bg-muted transition-colors"
            >
              Dictionnaire
            </a>
            <a
              href="#editorial"
              className="inline-flex items-center rounded-full border bg-card px-3 py-1 hover:bg-muted transition-colors"
            >
              Règles éditoriales
            </a>
            <a
              href="#licence"
              className="inline-flex items-center rounded-full border bg-card px-3 py-1 hover:bg-muted transition-colors"
            >
              Licence
            </a>
            <a
              href="#swagger"
              className="inline-flex items-center rounded-full border bg-card px-3 py-1 hover:bg-muted transition-colors"
            >
              Explorateur Swagger
            </a>
          </nav>
        </header>

        {/* Quickstart */}
        <section id="quickstart" className="mb-12 scroll-mt-20">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-2xl font-display font-bold">Quickstart</h2>
          </div>
          <p className="text-muted-foreground mb-4">
            Les trois exemples ci-dessous récupèrent les 260 affaires judiciaires publiées. Pour un
            usage pédagogique ou statistique, commencez par les exports CSV : ils contiennent tout
            en un seul fichier, correctement paginé, avec le poligraphId comme clé de jointure
            stable.
          </p>
          <QuickstartTabs />
        </section>

        {/* Bulk exports */}
        <section id="exports" className="mb-12 scroll-mt-20">
          <div className="flex items-center gap-2 mb-3">
            <FileDown className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-2xl font-display font-bold">Exports CSV</h2>
          </div>
          <p className="text-muted-foreground mb-4">
            Fichiers UTF-8 avec BOM (compatibles Excel et pandas), toutes les colonnes
            dénormalisées, jusqu{"'"}à 50 000 lignes par requête. Les descriptions sont nettoyées du
            markdown. Chaque ligne contient un poligraphId stable (voir ci-dessous) pour joindre
            plusieurs tables sans ambiguïté.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <ExportCard
              title="Affaires judiciaires"
              href="/api/export/affaires?limit=10000"
              description="40 colonnes : parti au moment des faits, gravité Sapin II, peine détaillée (amende, prison, inéligibilité), ECLI, description complète."
            />
            <ExportCard
              title="Politiques"
              href="/api/export/politiques"
              description="Identité, genre, parti + position politique, mandat en cours, département, prominence, Q-ID Wikidata pour croisement inter-jeux."
            />
            <ExportCard
              title="Fact-checks"
              href="/api/export/factchecks?limit=10000"
              description="Dénormalisé par politique mentionné (une ligne par paire). Filtres : verdict, source, politicianSlug."
            />
          </div>
          <div className="mt-4 text-sm text-muted-foreground">
            Paramètres communs : <code className="font-mono">limit</code> (max 50 000), filtres
            spécifiques documentés dans chaque endpoint Swagger ci-dessous.
          </div>
        </section>

        {/* Pagination */}
        <section id="pagination" className="mb-12 scroll-mt-20">
          <div className="flex items-center gap-2 mb-3">
            <Database className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-2xl font-display font-bold">Pagination JSON</h2>
          </div>
          <p className="text-muted-foreground mb-4">
            Toutes les routes JSON paginent à <strong>20 résultats par défaut</strong>, avec un
            maximum de <strong>100 par page</strong>. La réponse contient toujours un objet{" "}
            <code className="font-mono">pagination</code> pour savoir quand arrêter la boucle :
          </p>
          <CodeBlock
            language="json"
            code={`{
  "data": [ /* ... */ ],
  "pagination": {
    "page": 1,
    "limit": 100,
    "total": 260,
    "totalPages": 3
  }
}`}
          />
          <p className="text-sm text-muted-foreground mt-4">
            Pour les volumes importants (plus de quelques centaines de lignes), préférez les exports
            CSV ci-dessus : une seule requête au lieu de N, et Cache-Control optimisé côté serveur.
          </p>
        </section>

        {/* poligraphId */}
        <section id="poligraphid" className="mb-12 scroll-mt-20">
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-2xl font-display font-bold">
              poligraphId — identifiants stables pour citation
            </h2>
          </div>
          <p className="text-muted-foreground mb-4">
            Chaque entité citable reçoit un identifiant opaque, court et immuable que vous pouvez
            utiliser dans un article scientifique, un notebook, un export CSV ou un lien entrant.
            Contrairement aux slugs (qui peuvent changer si un titre est corrigé ou un nom mis à
            jour), le poligraphId est garanti stable dans le temps.
          </p>
          <div className="rounded-lg border bg-card p-4 mb-4">
            <p className="text-sm font-semibold mb-2">Préfixes</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
              <IdPrefix prefix="PG" label="Politicien" />
              <IdPrefix prefix="AF" label="Affaire" />
              <IdPrefix prefix="FC" label="Fact-check" />
              <IdPrefix prefix="SC" label="Scrutin" />
              <IdPrefix prefix="PT" label="Parti" />
              <IdPrefix prefix="EL" label="Élection" />
              <IdPrefix prefix="MA" label="Mandat" />
              <IdPrefix prefix="DO" label="Dossier législatif" />
              <IdPrefix prefix="GP" label="Groupe parlementaire" />
              <IdPrefix prefix="LM" label="Liste municipale" />
            </div>
          </div>
          <p className="text-muted-foreground mb-4">
            Format : <code className="font-mono">XX-000542</code> (deux lettres, tiret, entier sur 6
            chiffres minimum). Tout poligraphId est résoluble via un redirect 308 permanent qui suit
            les fusions d{"'"}affaires, pour que vos citations externes ne cassent jamais :
          </p>
          <CodeBlock
            language="bash"
            code={`# URL canonique citable dans un article
https://poligraph.fr/id/AF-000042

# Exemple d'une jointure côté pandas
affaires = pd.read_csv("https://poligraph.fr/api/export/affaires?limit=10000")
politiques = pd.read_csv("https://poligraph.fr/api/export/politiques")
join = affaires.merge(
    politiques,
    left_on="politicianPoligraphId",
    right_on="poligraphId",
    suffixes=("_affaire", "_pol"),
)`}
          />
        </section>

        {/* Data dictionary */}
        <section id="dictionary" className="mb-12 scroll-mt-20">
          <h2 className="text-2xl font-display font-bold mb-3">Dictionnaire des données</h2>
          <p className="text-muted-foreground mb-6">
            Les colonnes <code className="font-mono">XxxCode</code> des exports CSV contiennent les
            valeurs brutes des énumérations ci-dessous (stables et filtrables), tandis que les
            colonnes sans suffixe contiennent la traduction française lisible.
          </p>
          <DataDictionary />
        </section>

        {/* Editorial principles */}
        <section id="editorial" className="mb-12 scroll-mt-20">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-2xl font-display font-bold">
              Règles éditoriales à connaître avant d{"'"}analyser
            </h2>
          </div>
          <ul className="space-y-3 text-muted-foreground">
            <li>
              <strong className="text-foreground">Présomption d{"'"}innocence.</strong> Les affaires
              en cours sont signalées avec un niveau d{"'"}implication conservateur par défaut.
              Filtrez par <code className="font-mono">statusCode=CONDAMNATION_DEFINITIVE</code> si
              vous voulez isoler les condamnations définitives.
            </li>
            <li>
              <strong className="text-foreground">Gravité Sapin II.</strong> La colonne{" "}
              <code className="font-mono">severity</code> classe les infractions selon la
              spécificité au mandat (probité {">"} infractions graves {">"} autres), pas selon un
              jugement moral.
            </li>
            <li>
              <strong className="text-foreground">Implication par défaut.</strong> Les routes JSON
              filtrent par défaut sur <code className="font-mono">involvement=DIRECT</code>. Passez{" "}
              <code className="font-mono">involvement=DIRECT,MENTIONED_ONLY,SUSPECTED</code> pour
              élargir.
            </li>
            <li>
              <strong className="text-foreground">Sources vérifiées.</strong> Chaque affaire publiée
              a au moins une source journalistique vérifiable. La colonne{" "}
              <code className="font-mono">sourceCount</code> donne le nombre total,{" "}
              <code className="font-mono">sourceUrl</code> la première.
            </li>
          </ul>
          <p className="mt-4 text-sm">
            Méthodologie complète :{" "}
            <Link href="/sources" className="text-primary hover:underline">
              /sources
            </Link>
          </p>
        </section>

        {/* Licence */}
        <section id="licence" className="mb-12 scroll-mt-20">
          <h2 className="text-2xl font-display font-bold mb-3">Licence et citation</h2>
          <p className="text-muted-foreground mb-3">
            Les données publiées sont réutilisables pour des usages pédagogiques, journalistiques et
            de recherche avec citation de la source. Format recommandé pour un article ou un rapport
            :
          </p>
          <blockquote className="border-l-4 border-primary bg-muted/50 p-4 rounded-r-lg">
            <p className="italic">
              Poligraph, observatoire civique des politiques français, poligraph.fr, consulté le{" "}
              {new Date().toLocaleDateString("fr-FR")}.
            </p>
          </blockquote>
          <p className="text-sm text-muted-foreground mt-4">
            Pour signaler une erreur ou demander l{"'"}exercice d{"'"}un droit (correction,
            opposition) :{" "}
            <Link href="/contact" className="text-primary hover:underline">
              nous contacter
            </Link>
            .
          </p>
        </section>

        {/* Swagger */}
        <section id="swagger" className="mb-12 scroll-mt-20">
          <h2 className="text-2xl font-display font-bold mb-3">Explorateur Swagger complet</h2>
          <p className="text-muted-foreground mb-4">
            Spécification OpenAPI interactive : testez chaque route directement depuis le
            navigateur, voyez les paramètres et les schémas de réponse.
          </p>
          <details className="rounded-lg border bg-card">
            <summary className="cursor-pointer px-4 py-3 font-semibold hover:bg-muted/50 transition-colors rounded-lg">
              Afficher l{"'"}explorateur interactif
            </summary>
            <div className="border-t">
              <SwaggerUIWrapper />
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}

function ExportCard({
  title,
  href,
  description,
}: {
  title: string;
  href: string;
  description: string;
}) {
  return (
    <a
      href={href}
      className="block rounded-lg border bg-card p-4 hover:border-primary hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold">{title}</h3>
        <FileDown className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" aria-hidden="true" />
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
      <code className="text-xs font-mono text-primary mt-3 block truncate">{href}</code>
    </a>
  );
}

function IdPrefix({ prefix, label }: { prefix: string; label: string }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <code className="font-mono font-semibold text-primary">{prefix}</code>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
