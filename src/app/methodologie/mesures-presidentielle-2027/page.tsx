import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/Breadcrumb";

const PAGE_PATH = "/methodologie/mesures-presidentielle-2027";

export const metadata: Metadata = {
  title: "Méthode des mesures de la présidentielle 2027 | Poligraph",
  description:
    "Comment Poligraph sélectionne, source, relit, classe et compare les mesures des candidates et candidats à l'élection présidentielle de 2027.",
  alternates: { canonical: PAGE_PATH },
};

export default function PresidentialMeasuresMethodologyPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 pb-12 pt-4">
      <Breadcrumb
        items={[
          { label: "Méthodologie", href: "/methodologie" },
          { label: "Mesures de la présidentielle 2027" },
        ]}
      />

      <header className="mb-10">
        <p className="text-sm font-bold uppercase tracking-widest text-brand">
          Élection présidentielle 2027
        </p>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          Comment les mesures sont documentées
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          Cette page décrit ce qui entre dans le corpus, les contrôles effectués avant publication
          et les limites à garder en tête pour lire les comparaisons.
        </p>
      </header>

      <div className="space-y-12">
        <section aria-labelledby="definition-title">
          <h2 id="definition-title" className="font-display text-2xl font-bold">
            Ce que Poligraph appelle une mesure
          </h2>
          <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
            <p>
              Une mesure est une proposition d&apos;action ou un objectif vérifiable, attribuable à
              une candidature et rattaché à une source. Une valeur, un diagnostic ou une déclaration
              d&apos;intention générale ne suffit pas.
            </p>
            <p>
              Le texte publié reste aussi proche que possible de la formulation source. Poligraph ne
              complète pas une proposition avec une intention supposée et ne se prononce ni sur son
              opportunité, ni sur sa faisabilité.
            </p>
          </div>
        </section>

        <section aria-labelledby="sources-title">
          <h2 id="sources-title" className="font-display text-2xl font-bold">
            Sources et rattachement
          </h2>
          <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
            <p>
              La source de référence est prioritairement un programme officiel, un discours, un
              débat ou une interview de la candidate ou du candidat. Une source secondaire peut être
              utilisée lorsqu&apos;elle rapporte la proposition de façon vérifiable, avec son niveau
              indiqué sur la fiche.
            </p>
            <p>
              Chaque mesure est rattachée à une candidature déclarée et sourcée. Lorsqu&apos;une
              édition de programme existe, la fiche indique le document, sa date et
              l&apos;emplacement connu de la mesure.
            </p>
            <p>
              Le contexte qui explique ce que prévoit une mesure repose uniquement sur sa source
              attachée. Une définition ajoutée pour expliquer une notion technique suit un circuit
              distinct : elle doit provenir de la source elle-même ou d&apos;un site institutionnel
              officiel, avec son URL et sa date de vérification. Elle n&apos;est jamais présentée
              comme un élément du programme.
            </p>
          </div>
        </section>

        <section aria-labelledby="review-title">
          <h2 id="review-title" className="font-display text-2xl font-bold">
            Extraction, relecture et publication
          </h2>
          <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
            <p>
              Une mesure peut être saisie manuellement, importée ou proposée avec une assistance
              automatique. Elle reste un brouillon tant qu&apos;une personne ne l&apos;a pas relue
              avec sa source et validée pour publication.
            </p>
            <p>
              L&apos;intelligence artificielle peut aider à extraire ou classer un contenu. Elle ne
              publie pas une mesure, ne lui prête pas une intention et ne décide pas seule des
              rapprochements présentés au public.
            </p>
            <p>
              Lorsqu&apos;elle propose un contexte, chaque affirmation est rattachée aux extraits
              qui la soutiennent. Une quantité n&apos;est conservée que si elle figure dans
              l&apos;extrait cité. Le résultat reste un brouillon soumis à une relecture humaine.
            </p>
          </div>
        </section>

        <section aria-labelledby="classification-title">
          <h2 id="classification-title" className="font-display text-2xl font-bold">
            Thèmes et sous-thèmes
          </h2>
          <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
            <p>
              Chaque mesure appartient à l&apos;un des seize thèmes communs au corpus. Des
              sous-thèmes issus d&apos;une taxonomie fermée peuvent être proposés automatiquement,
              mais ils ne deviennent publics qu&apos;après validation humaine.
            </p>
            <p>
              Lorsqu&apos;un sous-thème est ajouté à cette taxonomie, Poligraph analyse uniquement
              les mesures susceptibles d&apos;être concernées et un petit échantillon témoin. Cette
              analyse produit des suggestions, jamais des validations automatiques. La version de la
              taxonomie, les critères de sélection et la décision proposée sont conservés dans le
              journal d&apos;audit. Une personne doit ensuite approuver chaque rattachement avant
              son affichage public.
            </p>
          </div>
        </section>

        <section aria-labelledby="history-title">
          <h2 id="history-title" className="font-display text-2xl font-bold">
            Corrections, évolutions et retraits
          </h2>
          <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
            <p>
              Une reformulation crée une nouvelle révision. La version déjà publique reste visible
              jusqu&apos;à la relecture et à la publication de la correction.
            </p>
            <p>
              Lorsqu&apos;une candidature abandonne une proposition, la mesure n&apos;est pas
              effacée. Son retrait est daté et sourcé afin de conserver l&apos;historique de la
              campagne.
            </p>
          </div>
        </section>

        <section aria-labelledby="comparison-title">
          <h2 id="comparison-title" className="font-display text-2xl font-bold">
            Comparaisons et votes parlementaires
          </h2>
          <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
            <p>
              Les pages de comparaison placent côte à côte les formulations publiées, sans score de
              proximité et sans classement politique. Les candidatures suivent un ordre
              alphabétique.
            </p>
            <p>
              Une mesure n&apos;est rapprochée d&apos;un scrutin de l&apos;Assemblée nationale ou du
              Sénat qu&apos;après examen de leur objet. Une position parlementaire ne peut être
              affichée que pour une personne qui siégeait au moment du vote. L&apos;absence de
              position ne permet donc pas de déduire une opinion.
            </p>
          </div>
        </section>

        <section aria-labelledby="limits-title" className="rounded-2xl border border-border p-5">
          <h2 id="limits-title" className="font-display text-2xl font-bold">
            Ce que couvre le corpus
          </h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            Poligraph publie progressivement les contenus trouvés, sourcés et relus. Une absence
            signifie qu&apos;aucune mesure correspondante n&apos;est publiée dans le corpus à cette
            date. Elle ne prouve pas qu&apos;une proposition n&apos;existe pas.
          </p>
        </section>
      </div>

      <nav aria-label="Liens complémentaires" className="mt-10 flex flex-wrap gap-4 border-t pt-6">
        <Link href="/elections/presidentielle-2027" className="font-bold text-primary underline">
          Consulter le dossier présidentielle 2027
        </Link>
        <Link href="/sources" className="font-bold text-primary underline">
          Voir les sources et principes éditoriaux
        </Link>
        <Link href="/methodologie" className="font-bold text-primary underline">
          Toutes les méthodes de Poligraph
        </Link>
      </nav>
    </main>
  );
}
