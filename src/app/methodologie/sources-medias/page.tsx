import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { OFFICIAL_SOURCE_HOSTS, PRESS_SOURCE_HOSTS } from "@/lib/affairs/events/sources";

const PAGE_PATH = "/methodologie/sources-medias";
const SOURCES_FILE_URL =
  "https://github.com/ironlam/poligraph/blob/main/src/lib/affairs/events/sources.ts";

export const metadata: Metadata = {
  title: "Médias admis comme sources des chronologies d'affaires",
  description:
    "Comment Poligraph décide qu'un média peut sourcer une étape de procédure judiciaire, qui tranche, comment demander un ajout, et la liste complète des sources admises.",
  alternates: { canonical: PAGE_PATH },
};

const linkClass = "text-primary hover:underline";

function HostList({ hosts, label }: { hosts: readonly string[]; label: string }) {
  return (
    <ul
      aria-label={label}
      className="mt-4 grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2 md:grid-cols-3"
    >
      {[...hosts]
        .sort((a, b) => a.localeCompare(b, "fr"))
        .map((host) => (
          <li key={host} className="font-mono">
            {host}
          </li>
        ))}
    </ul>
  );
}

export default function MediaSourcesMethodologyPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 pb-12 pt-4">
      <Breadcrumb
        items={[
          { label: "Méthodologie", href: "/methodologie" },
          { label: "Médias admis comme sources" },
        ]}
      />

      <header className="mb-10">
        <p className="text-sm font-bold uppercase tracking-widest text-brand">
          Affaires judiciaires
        </p>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          Les médias admis comme sources
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          La chronologie d&apos;une affaire retrace les étapes de la procédure : révélation,
          enquête, mise en examen, jugement. Chaque étape publiée renvoie à une source. Voici
          lesquelles nous acceptons, pourquoi, et comment demander un changement.
        </p>
      </header>

      <div className="space-y-12">
        <section aria-labelledby="deux-familles-title">
          <h2 id="deux-familles-title" className="font-display text-2xl font-bold">
            Deux familles de sources
          </h2>
          <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
            <p>
              Une source officielle émane d&apos;une juridiction, d&apos;une administration ou
              d&apos;une assemblée : une décision publiée par une cour d&apos;appel, un arrêt du
              Conseil d&apos;État, une délibération de la HATVP. Quand nous en disposons, nous la
              citons de préférence à un article de presse.
            </p>
            <p>
              Un article de presse doit venir d&apos;un média de la liste publiée plus bas. La
              révélation d&apos;une affaire se source toujours par un article, puisque c&apos;est la
              presse qui la rend publique. Une condamnation rapportée par la presse, même partielle,
              demande une seconde source : un autre média de la liste, ou une source officielle.
            </p>
          </div>
        </section>

        <section aria-labelledby="criteres-title">
          <h2 id="criteres-title" className="font-display text-2xl font-bold">
            Ce qui fait d&apos;un média une source admise
          </h2>
          <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
            <p>
              Le critère tient en une phrase : le site doit être celui d&apos;une rédaction
              professionnelle identifiable. Pour le vérifier, nous regardons les mentions légales et
              les articles eux-mêmes.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Un éditeur responsable est nommé, avec un directeur ou une directrice de la
                publication.
              </li>
              <li>
                Les articles sont écrits par des journalistes, signés ou attribués à la rédaction.
              </li>
              <li>
                Le média produit sa propre information. Republier le travail d&apos;autres sites ne
                suffit pas.
              </li>
            </ul>
            <p>
              La ligne éditoriale n&apos;entre pas en compte. Un titre d&apos;opinion est admis
              s&apos;il remplit ces conditions, quelle que soit son orientation. Trier les médias
              selon leurs positions reviendrait à prendre parti, et Poligraph applique les mêmes
              règles à tout le monde.
            </p>
            <p>
              Figurer sur la liste ne rend pas un article incontestable. Aucune étape n&apos;est
              publiée sans validation humaine, et une erreur signalée se corrige comme toute autre
              information du site.
            </p>
          </div>
        </section>

        <section aria-labelledby="refus-title">
          <h2 id="refus-title" className="font-display text-2xl font-bold">
            Ce que nous refusons
          </h2>
          <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
            <p>Certaines adresses ne sont jamais admises, même quand leur contenu est sérieux :</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                les encyclopédies collaboratives comme Wikipédia, qui résument d&apos;autres sources
                sans en être une ;
              </li>
              <li>les agrégateurs, qui reprennent des articles parus ailleurs ;</li>
              <li>les blogs, y compris ceux qu&apos;un journal héberge pour ses lecteurs ;</li>
              <li>les réseaux sociaux et les plateformes vidéo ;</li>
              <li>
                les sites de partis, d&apos;élus, ou d&apos;associations engagées dans une
                procédure, par exemple parce qu&apos;elles ont porté plainte.
              </li>
            </ul>
            <p>
              Dans ces cas, nous remontons à l&apos;origine de l&apos;information : la décision de
              justice, ou l&apos;article de la rédaction qui l&apos;a publiée en premier.
            </p>
          </div>
        </section>

        <section aria-labelledby="decision-title">
          <h2 id="decision-title" className="font-display text-2xl font-bold">
            Qui décide
          </h2>
          <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
            <p>
              Poligraph tient la liste. Nous préférons une liste qui s&apos;allonge à une liste qui
              écarte des rédactions légitimes : un titre qui remplit les critères y entre, sans
              quota ni équilibre recherché.
            </p>
            <p>
              Quand une étape cite un média absent de la liste, sa publication est bloquée. Le titre
              est alors examiné, puis ajouté s&apos;il remplit les critères. Chaque modification
              reste visible dans l&apos;historique public du{" "}
              <Link
                href={SOURCES_FILE_URL}
                className={linkClass}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="fichier des sources admises, sur GitHub (nouvel onglet)"
              >
                fichier des sources admises
              </Link>
              .
            </p>
          </div>
        </section>

        <section aria-labelledby="demande-title">
          <h2 id="demande-title" className="font-display text-2xl font-bold">
            Demander un ajout ou contester un titre
          </h2>
          <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
            <p>
              Un média manque ? Un titre de la liste ne vous paraît pas remplir les critères ?
              Écrivez-nous avec le nom du média, son adresse et ce qui motive votre demande. Vous
              pouvez ouvrir une demande publique sur{" "}
              <Link
                href="https://github.com/ironlam/poligraph/issues"
                className={linkClass}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub, demandes publiques (nouvel onglet)"
              >
                GitHub
              </Link>{" "}
              ou écrire à{" "}
              <a href="mailto:contact@poligraph.fr" className={linkClass}>
                contact@poligraph.fr
              </a>
              .
            </p>
            <p>
              Nous examinons chaque demande au regard des critères de cette page. Si elle est
              retenue, la liste ci-dessous change en conséquence.
            </p>
          </div>
        </section>

        <section aria-labelledby="fiches-title">
          <h2 id="fiches-title" className="font-display text-2xl font-bold">
            Et les sources des fiches d&apos;affaires ?
          </h2>
          <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
            <p>
              Cette liste concerne les étapes de la chronologie. Elle ne touche pas aux sources déjà
              attachées aux fiches d&apos;affaires, qui suivent la règle décrite dans la{" "}
              <Link href="/methodologie#affaires-judiciaires" className={linkClass}>
                méthodologie des affaires judiciaires
              </Link>{" "}
              : au moins une source journalistique vérifiable par affaire.
            </p>
            <p>
              Si ces critères s&apos;appliquent un jour aux fiches, les sources existantes resteront
              en place.
            </p>
          </div>
        </section>

        <section aria-labelledby="liste-title">
          <h2 id="liste-title" className="font-display text-2xl font-bold">
            La liste complète
          </h2>
          <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
            <p>
              Cette liste est lue directement dans le fichier qui sert au contrôle des étapes. Ce
              que vous lisez ici est donc ce que le site applique. Une adresse couvre ses
              sous-domaines (lemonde.fr inclut www.lemonde.fr), sauf un sous-domaine de blog comme
              blogs.mediapart.fr, qui reste refusé.
            </p>
          </div>

          <h3 className="mt-8 font-display text-xl font-semibold">
            Sources officielles ({OFFICIAL_SOURCE_HOSTS.length} adresses)
          </h3>
          <HostList hosts={OFFICIAL_SOURCE_HOSTS} label="Sources officielles admises" />

          <h3 className="mt-8 font-display text-xl font-semibold">
            Médias ({PRESS_SOURCE_HOSTS.length} adresses)
          </h3>
          <HostList hosts={PRESS_SOURCE_HOSTS} label="Médias admis" />
        </section>
      </div>
    </main>
  );
}
