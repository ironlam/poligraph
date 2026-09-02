import { Metadata } from "next";
import Link from "next/link";
import {
  CERTAINTY_LABELS,
  CERTAINTY_COLORS,
  CERTAINTY_DESCRIPTIONS,
  type CertaintyLevel,
} from "@/config/certainty";
import { AFFAIR_SUPER_CATEGORY_LABELS, type AffairSuperCategory } from "@/config/labels";
import { Breadcrumb } from "@/components/ui/Breadcrumb";

export const metadata: Metadata = {
  title: "Méthodologie de Poligraph",
  description:
    "Découvrez comment Poligraph sélectionne, source, vérifie et présente ses données politiques.",
  alternates: { canonical: "/methodologie" },
};

const CERTAINTY_ORDER: CertaintyLevel[] = [
  "ETABLI",
  "PRONONCE",
  "EN_COURS",
  "CLOS_SANS_CHARGE",
  "CLOS_FAVORABLE",
];

const CERTAINTY_STATUSES: Record<CertaintyLevel, string[]> = {
  ETABLI: ["Condamnation définitive"],
  PRONONCE: ["Condamnation en première instance", "Appel en cours"],
  EN_COURS: [
    "Enquête préliminaire",
    "Instruction",
    "Mise en examen",
    "Renvoi devant le tribunal",
    "Procès en cours",
  ],
  CLOS_SANS_CHARGE: ["Instruction clôturée, sans mise en examen"],
  CLOS_FAVORABLE: [
    "Relaxe",
    "Acquittement",
    "Non-lieu",
    "Action publique éteinte par prescription",
    "Classement sans suite",
  ],
};

const SUPER_CATEGORIES: { key: AffairSuperCategory; description: string }[] = [
  {
    key: "PROBITE",
    description:
      "Infractions liées à l'exercice d'un mandat ou d'une fonction publique : corruption, détournement de fonds publics, prise illégale d'intérêts, financement illégal de campagne. Ces infractions sont spécifiques aux responsables publics (inspiré de la classification Sapin II).",
  },
  {
    key: "FINANCES",
    description:
      "Infractions financières de droit commun : fraude fiscale, abus de biens sociaux, blanchiment, escroquerie.",
  },
  {
    key: "PERSONNES",
    description:
      "Atteintes aux personnes : violences, harcèlement moral ou sexuel, agressions sexuelles, menaces.",
  },
  {
    key: "EXPRESSION",
    description:
      "Infractions liées à l'expression publique : diffamation, injure, provocation à la haine, apologie du terrorisme.",
  },
  {
    key: "AUTRE",
    description: "Infractions ne relevant pas des catégories précédentes.",
  },
];

export default function MethodologiePage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 pt-4 pb-12">
      <Breadcrumb items={[{ label: "Sources", href: "/sources" }, { label: "Méthodologie" }]} />
      <h1 className="text-3xl font-display font-extrabold tracking-tight mb-2">Méthodologie</h1>
      <p className="text-muted-foreground mb-6">
        Comment Poligraph sélectionne, vérifie et présente les informations publiées sur le site.
      </p>

      <nav aria-label="Méthodes par domaine" className="mb-12 grid gap-3 sm:grid-cols-2">
        <Link
          href="/methodologie/mesures-presidentielle-2027"
          className="rounded-xl border border-border p-4 hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span className="block font-bold">Mesures de la présidentielle 2027</span>
          <span className="mt-1 block text-sm text-muted-foreground">
            Sélection, sources, relecture, classement et comparaison.
          </span>
        </Link>
        <Link
          href="#affaires-judiciaires"
          className="rounded-xl border border-border p-4 hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span className="block font-bold">Affaires judiciaires</span>
          <span className="mt-1 block text-sm text-muted-foreground">
            Niveaux de certitude, catégories et règles de comptage.
          </span>
        </Link>
      </nav>

      <section id="affaires-judiciaires" aria-labelledby="affaires-judiciaires-title">
        <h2
          id="affaires-judiciaires-title"
          className="mb-2 font-display text-2xl font-extrabold tracking-tight"
        >
          Affaires judiciaires
        </h2>
        <p className="mb-10 text-muted-foreground">
          Comment Poligraph classe, présente et comptabilise les procédures judiciaires.
        </p>

        {/* Section 1: Certainty levels */}
        <section className="mb-12">
          <h3 className="text-xl font-display font-semibold mb-4">
            Niveaux de certitude judiciaire
          </h3>
          <p className="text-muted-foreground mb-6">
            Chaque affaire est classée selon l{"'"}avancement de la procédure judiciaire. Ce
            classement reflète le degré de certitude juridique, pas la gravité de l{"'"}infraction.
          </p>
          <div className="space-y-4">
            {CERTAINTY_ORDER.map((level) => (
              <div key={level} className="rounded-lg border p-4">
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${CERTAINTY_COLORS[level]}`}
                  >
                    {CERTAINTY_LABELS[level]}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  {CERTAINTY_DESCRIPTIONS[level]}
                </p>
                <ul className="text-sm text-muted-foreground list-disc list-inside">
                  {CERTAINTY_STATUSES[level].map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Section 2: Super-categories */}
        <section className="mb-12">
          <h3 className="text-xl font-display font-semibold mb-4">Types d{"'"}infractions</h3>
          <p className="text-muted-foreground mb-6">
            Les affaires sont regroupées en cinq grandes catégories, inspirées du cadre de la{" "}
            <Link
              href="https://www.legifrance.gouv.fr/loda/id/JORFTEXT000033558528"
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              loi Sapin II
            </Link>{" "}
            pour la distinction entre infractions liées à la probité et infractions de droit commun.
          </p>
          <div className="space-y-3">
            {SUPER_CATEGORIES.map(({ key, description }) => (
              <div key={key} className="rounded-lg border p-4">
                <h4 className="font-medium mb-1">{AFFAIR_SUPER_CATEGORY_LABELS[key]}</h4>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3: Counting rules / Maturity model */}
        <section id="comment-nous-comptons" className="mb-12">
          <h3 className="text-xl font-display font-semibold mb-4">Comment nous comptons</h3>
          <p className="text-muted-foreground mb-6">
            Les compteurs agrégés (page d{"'"}accueil, pages de partis, badges sur les profils)
            utilisent un seuil de maturité judiciaire pour ne mettre en avant que les affaires
            validées par un juge.
          </p>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-lg border border-red-200 dark:border-red-800 p-4">
              <h4 className="font-medium text-foreground mb-1">Condamnations (comptabilisées)</h4>
              <p>
                Condamnation définitive, condamnation en première instance ou appel en cours. Ce
                sont les affaires où un tribunal a prononcé une peine. Elles forment le chiffre
                principal affiché dans les compteurs.
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 p-4">
              <h4 className="font-medium text-foreground mb-1">
                Procédures validées par un juge (comptabilisées)
              </h4>
              <p>
                Mise en examen, instruction, renvoi devant le tribunal, procès en cours. Un juge a
                estimé qu{"'"}il existait des indices graves ou concordants justifiant des
                poursuites.
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <h4 className="font-medium text-foreground mb-1">
                Enquêtes préliminaires (non comptabilisées)
              </h4>
              <p>
                Les enquêtes préliminaires ne sont <strong>pas</strong> comptabilisées dans les
                totaux agrégés. N{"'"}importe qui peut porter plainte : une enquête préliminaire ne
                signifie pas qu{"'"}un juge a validé les accusations. Ces affaires restent visibles
                sur la fiche détaillée du politicien.
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <h4 className="font-medium text-foreground mb-1">
                Procédures closes sans condamnation
              </h4>
              <p>
                Relaxe, acquittement, non-lieu et classement sans suite : la procédure s{"'"}est
                terminée sans condamnation. Ces issues favorables sont affichées séparément des
                condamnations et ne sont jamais présentées comme une mise en cause active.
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <h4 className="font-medium text-foreground mb-1">
                Action publique éteinte par prescription
              </h4>
              <p>
                La prescription clôt la procédure sans condamnation, mais à la différence d{"'"}une
                relaxe ou d{"'"}un non-lieu, elle ne constitue pas une décision sur le fond. Elle
                est donc signalée distinctement, et non assimilée à une issue favorable au fond.
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <h4 className="font-medium text-foreground mb-1">Implication directe et indirecte</h4>
              <p>
                Seules les affaires où le politicien est directement ou indirectement impliqué (mis
                en cause, poursuivi ou condamné) sont comptabilisées dans les agrégats à charge. Les
                simples mentions dans une affaire tierce ou les cas où le politicien est
                victime/plaignant ne sont pas inclus dans ces compteurs.
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <h4 className="font-medium text-foreground mb-1">Décompte par politicien</h4>
              <p>
                Les statistiques globales ({'"'}élus condamnés{'"'}, {'"'}élus mis en cause{'"'})
                comptent le nombre de politiciens uniques concernés, pas le nombre total d{"'"}
                affaires.
              </p>
            </div>
          </div>
        </section>

        {/* Section 3b: Per-role counters on the politician page */}
        <section className="mb-12">
          <h3 className="text-xl font-display font-semibold mb-4">
            Compteurs d{"'"}affaires sur la fiche d{"'"}un politicien
          </h3>
          <p className="text-muted-foreground mb-6">
            La fiche d{"'"}un politicien expose plusieurs compteurs, qui ne mesurent pas la même
            chose. Ils sont volontairement distincts pour ne pas mélanger une mise en cause, une
            simple mention et une situation de victime.
          </p>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-lg border p-4">
              <h4 className="font-medium text-foreground mb-1">
                Total des affaires publiées (tous rôles confondus)
              </h4>
              <p>
                Le compteur général recense toutes les affaires publiées impliquant la personne,
                quel que soit son rôle : mise en cause, simplement mentionnée, victime ou
                plaignante. Ce chiffre ne dit donc rien, à lui seul, du degré de mise en cause.
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <h4 className="font-medium text-foreground mb-1">À charge (procédures validées)</h4>
              <p>
                Affaires où la personne est mise en cause (directement ou indirectement) et où un
                juge a validé la procédure : condamnations et procédures validées par un juge. Les
                enquêtes préliminaires en sont exclues.
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <h4 className="font-medium text-foreground mb-1">Issues favorables</h4>
              <p>
                Affaires où la personne était mise en cause et dont la procédure s{"'"}est terminée
                sans condamnation : relaxe, acquittement, non-lieu, classement sans suite et
                prescription.
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <h4 className="font-medium text-foreground mb-1">Simple mention</h4>
              <p>Affaires où la personne est citée sans être mise en cause ni poursuivie.</p>
            </div>
            <div className="rounded-lg border p-4">
              <h4 className="font-medium text-foreground mb-1">Victime ou plaignant</h4>
              <p>
                Affaires où la personne est victime ou a porté plainte. Ces affaires ne sont jamais
                comptées comme une mise en cause.
              </p>
            </div>
            <p className="text-xs">
              Ces compteurs ne se cumulent pas pour reconstituer le total : une enquête préliminaire
              visant directement la personne, par exemple, n{"'"}entre ni dans les affaires à charge
              (faute de validation par un juge), ni dans les issues favorables.
            </p>
          </div>
        </section>

        {/* Section 4: Presumption of innocence */}
        <section className="mb-12">
          <h3 className="text-xl font-display font-semibold mb-4">Présomption d{"'"}innocence</h3>
          <p className="text-muted-foreground text-sm">
            Conformément à l{"'"}article 9-1 du Code civil, toute personne mise en cause dans une
            procédure judiciaire est présumée innocente jusqu{"'"}à ce qu{"'"}elle ait été déclarée
            coupable par une décision de justice définitive. Cette mention apparaît systématiquement
            sur les fiches de politiciens concernés par des procédures en cours ou des condamnations
            non définitives. Le référencement d{"'"}une affaire sur Poligraph ne constitue en aucun
            cas un jugement de valeur.
          </p>
        </section>

        {/* Section 5: Victims/plaintiffs */}
        <section className="mb-12">
          <h3 className="text-xl font-display font-semibold mb-4">Victimes et plaignants</h3>
          <p className="text-muted-foreground text-sm">
            Lorsqu{"'"}un politicien est victime ou plaignant dans une affaire (violences, menaces,
            harcèlement), cette information est traitée séparément des affaires où il est mis en
            cause. Ces affaires ne sont jamais comptabilisées dans les indicateurs d{"'"}intégrité
            et apparaissent dans une section distincte sur le profil.
          </p>
        </section>

        {/* Section 6: Sources */}
        <section className="mb-8">
          <h3 className="text-xl font-display font-semibold mb-4">Sources</h3>
          <p className="text-muted-foreground text-sm">
            Chaque affaire judiciaire référencée sur Poligraph est documentée par au moins une
            source journalistique vérifiable (Le Monde, Mediapart, AFP, etc.). Les données
            officielles (Assemblée nationale, Sénat, gouvernement) prévalent sur les sources
            tierces. Pour plus de détails sur nos sources de données, consultez la page{" "}
            <Link href="/sources" className="text-primary hover:underline">
              Sources et principes éditoriaux
            </Link>
            .
          </p>
        </section>
      </section>
    </main>
  );
}
