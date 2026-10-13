import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/Breadcrumb";

const PAGE_PATH = "/methodologie/decisions-territoires";
const PROTOCOL_DATE = "13 octobre 2026";

export const metadata: Metadata = {
  title: "Décisions des conseils : protocole de sélection et de saisie",
  description:
    "Comment Poligraph choisit les communes du pilote, les actes retenus, les sources admises et la relecture des décisions des conseils municipaux et communautaires.",
  alternates: { canonical: PAGE_PATH },
};

const linkClass = "text-primary hover:underline";

const PILOT_COMMUNES: ReadonlyArray<{ name: string; department: string; stratum: string }> = [
  { name: "Taugon", department: "17", stratum: "moins de 1 000 habitants" },
  { name: "Bouloc", department: "31", stratum: "1 000 à 9 999" },
  { name: "Boé", department: "47", stratum: "1 000 à 9 999" },
  { name: "Neuville-sur-Saône", department: "69", stratum: "1 000 à 9 999" },
  { name: "Cogolin", department: "83", stratum: "10 000 à 99 999" },
  { name: "Rillieux-la-Pape", department: "69", stratum: "10 000 à 99 999" },
  { name: "La Possession", department: "974", stratum: "10 000 à 99 999" },
  { name: "Saint-Herblain", department: "44", stratum: "10 000 à 99 999" },
  { name: "Villejuif", department: "94", stratum: "10 000 à 99 999" },
  { name: "Antibes", department: "06", stratum: "10 000 à 99 999" },
  { name: "Kourou", department: "973", stratum: "10 000 à 99 999" },
  { name: "Brest", department: "29", stratum: "100 000 et plus" },
  { name: "Saint-Étienne", department: "42", stratum: "100 000 et plus" },
];

const CORE_SUBJECTS: ReadonlyArray<{ code: string; label: string }> = [
  { code: "1.1", label: "Commande publique, marchés publics" },
  { code: "2.1", label: "Urbanisme, documents d'urbanisme" },
  { code: "3.1", label: "Domaine et patrimoine, acquisitions" },
  { code: "3.2", label: "Domaine et patrimoine, aliénations" },
  { code: "7.1", label: "Finances locales, décisions budgétaires" },
  { code: "7.5", label: "Finances locales, subventions (aux personnes morales seulement)" },
  { code: "8.4", label: "Aménagement du territoire" },
  { code: "8.8", label: "Environnement" },
];

export default function TerritoireDecisionsMethodologyPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 pb-12 pt-4">
      <Breadcrumb
        items={[
          { label: "Méthodologie", href: "/methodologie" },
          { label: "Décisions des conseils" },
        ]}
      />

      <header className="mb-10">
        <p className="text-sm font-bold uppercase tracking-widest text-brand">Territoires</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          Décisions des conseils : comment nous les choisissons
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          Poligraph prépare un pilote sur les décisions des conseils municipaux. Voici les règles
          fixées avant la première saisie, pour que chacun puisse les contrôler. Protocole arrêté le{" "}
          {PROTOCOL_DATE}. Aucune décision n&apos;est encore publiée.
        </p>
      </header>

      <div className="space-y-12">
        <section aria-labelledby="objet-title">
          <h2 id="objet-title" className="font-display text-2xl font-bold">
            Ce que le pilote publie, et ce qu&apos;il ne dit pas
          </h2>
          <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
            <p>
              Des notices de décisions collectives adoptées par un conseil municipal ou
              communautaire. Chacune est rattachée au conseil qui l&apos;a adoptée, datée, et
              prouvée par un document officiel, avec l&apos;endroit exact du document où la preuve
              se trouve.
            </p>
            <p>
              C&apos;est une sélection documentée, pas un relevé exhaustif. Le nombre de décisions
              référencées ne mesure ni l&apos;activité ni la performance d&apos;un conseil, et nous
              ne classons jamais des communes selon ce nombre. Une décision collective n&apos;est
              jamais attribuée au maire ni à un conseiller : être en fonction à une date n&apos;est
              pas avoir voté.
            </p>
          </div>
        </section>

        <section aria-labelledby="couches-title">
          <h2 id="couches-title" className="font-display text-2xl font-bold">
            Trois couches
          </h2>
          <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
            <p>
              Choisir à la main les actes importants introduirait un biais éditorial. Se limiter à
              des matières communes ferait perdre ce qui est propre à une commune. Nous combinons
              donc trois couches.
            </p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                <strong>Un socle commun.</strong> Les mêmes matières pour toutes les communes, en
                notices relues, avec la localisation de la preuve.
              </li>
              <li>
                <strong>Un lien vers la liste officielle.</strong> Toutes les délibérations de la
                collectivité, à la source, sans copie chez nous.
              </li>
              <li>
                <strong>Des actes signalés.</strong> Un habitant signale une délibération précise
                avec le lien du document. Elle passe par la même relecture.
              </li>
            </ol>
            <p>
              Nous ne recopions pas tous les fichiers ouverts : leurs objets citent parfois des
              personnes nommées, et la relecture d&apos;un volume de plusieurs centaines
              d&apos;actes par an n&apos;apporterait rien de plus que le lien officiel. Nous ne
              triions pas non plus sur les votes non unanimes, ce qui se lirait comme un signal
              politique.
            </p>
          </div>

          <h3 className="mt-8 font-display text-xl font-semibold">Les matières du socle</h3>
          <p className="mt-2 leading-relaxed text-muted-foreground">
            Nomenclature des matières des actes des collectivités. Les actes nominatifs sur des
            agents, la désignation de représentants, le fonctionnement des assemblées et la
            catégorie « autres domaines » ne font pas partie du socle.
          </p>
          <ul
            aria-label="Matières du socle"
            className="mt-4 space-y-1 text-sm text-muted-foreground"
          >
            {CORE_SUBJECTS.map((s) => (
              <li key={s.code}>
                <span className="font-mono">{s.code}</span> {s.label}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="communes-title">
          <h2 id="communes-title" className="font-display text-2xl font-bold">
            Les treize communes du pilote
          </h2>
          <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
            <p>
              Les critères : des tailles différentes (quatre strates), au moins une commune
              d&apos;outre-mer, des actes publiés en ligne et à jour, un maire en fonction établi,
              et des cas d&apos;épreuve variés (changement de maire en cours de mandat, réélection,
              acte intercommunal). Ni l&apos;étiquette du maire ni la couleur du conseil
              n&apos;entrent dans le choix, et aucune commune n&apos;est retenue pour une actualité.
            </p>
          </div>
          <ul aria-label="Communes du pilote" className="mt-4 grid gap-1 text-sm sm:grid-cols-2">
            {PILOT_COMMUNES.map((c) => (
              <li key={c.name} className="text-muted-foreground">
                <span className="font-semibold text-foreground">{c.name}</span> ({c.department}),{" "}
                {c.stratum}
              </li>
            ))}
          </ul>
          <div className="mt-6 space-y-4 leading-relaxed text-muted-foreground">
            <p>
              <strong>Un biais assumé.</strong> Le pilote ne peut contenir que des communes dont les
              actes sont en ligne et lisibles. Ce sont en moyenne des communes plus grandes et plus
              transparentes que celles qui ne publient pas. Les constats du pilote ne se
              généralisent donc pas à l&apos;ensemble des communes.
            </p>
            <p>
              <strong>L&apos;outre-mer.</strong> Deux communes, de bassins différents : La
              Possession et Kourou. Les collectivités d&apos;outre-mer sans commune
              (Saint-Barthélemy, Saint-Martin, Wallis-et-Futuna, TAAF) sortent du pilote par
              construction.
            </p>
          </div>
        </section>

        <section aria-labelledby="sources-title">
          <h2 id="sources-title" className="font-display text-2xl font-bold">
            Sources admises
          </h2>
          <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
            <p>
              Sont admis : la délibération publiée par la collectivité, le procès-verbal approuvé,
              la liste des délibérations affichée après la séance, le recueil des actes
              administratifs. Ne suffisent jamais seuls : un ordre du jour (il ne prouve pas
              l&apos;adoption), un article de presse, un communiqué, un réseau social, un site de
              groupe d&apos;élus, une copie sans l&apos;original consultable.
            </p>
            <p>
              Le document doit être en ligne. Poligraph ne le télécharge pas depuis ses serveurs :
              il affiche le lien, et peut y ajouter une archive au cas où la commune déplacerait le
              fichier.
            </p>
          </div>
        </section>

        <section aria-labelledby="saisie-title">
          <h2 id="saisie-title" className="font-display text-2xl font-bold">
            Saisie et relecture
          </h2>
          <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                L&apos;objet reprend l&apos;intitulé de la source, sans qualificatif ajouté ni
                résumé généré par une IA.
              </li>
              <li>
                La date est celle de la séance. Une date de publication ne la remplace jamais.
              </li>
              <li>
                L&apos;issue (adoptée ou rejetée) n&apos;est saisie que si la source l&apos;établit,
                et confirmée par la personne qui relit sur le document. Aucun vote individuel
                n&apos;est saisi.
              </li>
              <li>Une décision, une notice : on vérifie qu&apos;elle n&apos;existe pas déjà.</li>
            </ul>
            <p>
              Une notice est créée en brouillon, relue sur le document à l&apos;endroit indiqué,
              puis publiée ou rejetée avec un motif. Une notice publiée ne se modifie pas : on la
              dépublie avec un motif, on la corrige, elle repasse en relecture.
              L&apos;administration n&apos;a pour l&apos;instant qu&apos;un compte partagé, le nom
              du relecteur est donc déclaratif.
            </p>
            <p>
              Chaque lien est revérifié tous les six mois. Un lien mort est remplacé par
              l&apos;archive ou la nouvelle adresse, à défaut la notice est dépubliée.
            </p>
          </div>
        </section>

        <section aria-labelledby="jamais-title">
          <h2 id="jamais-title" className="font-display text-2xl font-bold">
            Ce que nous ne faisons jamais
          </h2>
          <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
            <ul className="list-disc space-y-2 pl-5">
              <li>Attribuer une décision collective à un élu.</li>
              <li>Déduire un vote individuel d&apos;un résultat, même unanime.</li>
              <li>Classer ou comparer des communes par nombre de décisions.</li>
              <li>Importer automatiquement des délibérations sans relecture.</li>
              <li>Publier une notice sans source consultable ni localisation dans la source.</li>
            </ul>
            <p>
              Pour une correction ou un signalement, passez par la page{" "}
              <Link href="/support" className={linkClass}>
                support
              </Link>
              . Le cadre général de nos sources est décrit dans la{" "}
              <Link href="/methodologie" className={linkClass}>
                méthodologie
              </Link>
              .
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
