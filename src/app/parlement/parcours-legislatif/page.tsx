import type { Metadata } from "next";
import Link from "next/link";
import {
  BandeauFilAriane,
  BandeauSurtitre,
  RubriqueBandeau,
} from "@/components/ui/RubriqueBandeau";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";
import { BRAND_NAVY } from "@/config/brand";
import { SENAT_ACCENT, chamberPath } from "@/config/chambres";
import { DOSSIER_STATUS_SITUATIONS } from "@/config/labels";
import { LEGISLATIVE_JOURNEY_STEPS } from "@/config/legislative-journey";
import { ROUTES } from "@/config/routes";
import { SITE_URL } from "@/config/site";
import type { DossierStatus } from "@/generated/prisma";

export const revalidate = 86400;

const DESCRIPTION =
  "De l'idée au Journal officiel : comment un texte traverse l'Assemblée nationale et le Sénat, et comment lire son état sur Poligraph.";

export const metadata: Metadata = {
  title: "Le parcours d'une loi, de l'Assemblée au Sénat",
  description: DESCRIPTION,
  alternates: { canonical: ROUTES.parcoursLegislatif },
};

const ETAPES_PAR_CHAMBRE = [
  {
    label: "Dépôt",
    an: "Le texte est enregistré à l'Assemblée. Il n'est pas encore examiné.",
    senat: "Ou il est déposé au Sénat : un texte peut commencer par l'une ou l'autre chambre.",
  },
  {
    label: "Commission",
    an: "Un groupe restreint de députés étudie le texte et propose des amendements.",
    senat: "Même étape au Sénat, avec des sénateurs.",
  },
  {
    label: "Séance publique",
    an: "Débat dans l'hémicycle, vote des amendements puis du texte.",
    senat: "Même débat au Sénat, souvent avec un texte modifié.",
  },
] as const;

function Pastille({ n, fond = BRAND_NAVY }: { n: number; fond?: string }) {
  return (
    <span
      className="inline-flex h-11 w-11 items-center justify-center rounded-full font-display text-lg font-extrabold text-white"
      style={{ backgroundColor: fond }}
      aria-hidden="true"
    >
      {n}
    </span>
  );
}

export default function ParcoursLegislatifPage() {
  const premieres = ETAPES_PAR_CHAMBRE.length;
  const communes = LEGISLATIVE_JOURNEY_STEPS.slice(premieres);

  return (
    <>
      <CollectionPageJsonLd
        name="Le parcours d'une loi"
        description={DESCRIPTION}
        url={`${SITE_URL}${ROUTES.parcoursLegislatif}`}
      />
      <RubriqueBandeau labelledBy="parcours-titre">
        <div className="max-w-3xl">
          <BandeauFilAriane
            items={[
              { label: "Parlement", href: ROUTES.parlement },
              { label: "Parcours d'une loi" },
            ]}
          />
          <div className="mt-4">
            <BandeauSurtitre>Comprendre</BandeauSurtitre>
          </div>
          <h1
            id="parcours-titre"
            className="mt-4 font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl"
          >
            Le parcours d{"'"}une loi
          </h1>
          <p className="mt-4 max-w-2xl text-base text-white/85 sm:text-lg">
            De l{"'"}idée au Journal officiel, un texte traverse les deux chambres. Voici ce qui se
            passe à chaque étape et où le suivre sur Poligraph.
          </p>
        </div>
      </RubriqueBandeau>

      <div className="container mx-auto max-w-5xl space-y-12 px-4 py-10">
        <section aria-labelledby="origine" className="rounded-2xl border border-border bg-card p-6">
          <h2 id="origine" className="font-display text-2xl font-extrabold text-primary">
            Qui peut proposer une loi ?
          </h2>
          <dl className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border p-4">
              <dt className="font-display text-lg font-bold">Projet de loi</dt>
              <dd className="mt-1 text-sm text-muted-foreground">
                Le texte vient du Gouvernement.
              </dd>
            </div>
            <div className="rounded-xl border border-border p-4">
              <dt className="font-display text-lg font-bold">Proposition de loi</dt>
              <dd className="mt-1 text-sm text-muted-foreground">
                Le texte vient de députés ou de sénateurs.
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="etapes">
          <h2 id="etapes" className="font-display text-2xl font-extrabold text-primary">
            Étape par étape
          </h2>
          <ol className="mt-6 space-y-5">
            {ETAPES_PAR_CHAMBRE.map((etape, i) => (
              <li key={etape.label} className="grid gap-3 md:grid-cols-2">
                <div
                  className="rounded-2xl border border-border bg-card p-4"
                  style={{ borderTop: `4px solid ${BRAND_NAVY}` }}
                >
                  <div className="flex items-center gap-3">
                    <Pastille n={i + 1} />
                    <h3 className="font-display text-lg font-bold">{etape.label}</h3>
                  </div>
                  <p className="mt-2 text-xs font-bold text-primary">Assemblée nationale</p>
                  <p className="mt-1 text-sm text-muted-foreground">{etape.an}</p>
                </div>
                <div
                  className="rounded-2xl border border-border bg-card p-4"
                  style={{ borderTop: `4px solid ${SENAT_ACCENT}` }}
                >
                  <p className="text-xs font-bold" style={{ color: SENAT_ACCENT }}>
                    Sénat
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{etape.senat}</p>
                </div>
              </li>
            ))}
            {communes.map((step, i) => (
              <li
                key={step.label}
                className="rounded-2xl border-2 border-border bg-card p-5 text-center"
                value={premieres + i + 1}
              >
                <Pastille n={premieres + i + 1} fond={i === 0 ? SENAT_ACCENT : BRAND_NAVY} />
                <h3 className="mt-2 font-display text-xl font-bold">{step.label}</h3>
                <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-muted-foreground">
            En cas de désaccord persistant, une commission mixte paritaire de 7 députés et 7
            sénateurs cherche un texte commun. Si elle échoue, l{"'"}Assemblée peut avoir le dernier
            mot.
          </p>
        </section>

        <section aria-labelledby="statuts" className="rounded-2xl border border-border bg-card p-6">
          <h2 id="statuts" className="font-display text-2xl font-extrabold text-primary">
            Lire l{"'"}état d{"'"}un texte sur Poligraph
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Chaque dossier législatif affiche un statut. Voici ce que chacun veut dire.
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(DOSSIER_STATUS_SITUATIONS) as DossierStatus[]).map((statut) => (
              <li
                key={statut}
                className="rounded-xl border border-border p-3 text-sm text-muted-foreground"
              >
                {DOSSIER_STATUS_SITUATIONS[statut]}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href={ROUTES.dossiers}
              className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
            >
              Parcourir les lois en construction
            </Link>
            <Link
              href={chamberPath("AN")}
              className="inline-flex min-h-11 items-center rounded-lg border border-border px-5 text-sm font-bold text-primary hover:bg-muted"
            >
              Assemblée nationale
            </Link>
            <Link
              href={chamberPath("SENAT")}
              className="inline-flex min-h-11 items-center rounded-lg border border-border px-5 text-sm font-bold hover:bg-muted"
              style={{ color: SENAT_ACCENT }}
            >
              Sénat
            </Link>
          </div>
        </section>

        <p className="max-w-3xl text-xs text-muted-foreground">
          Procédure simplifiée à visée pédagogique : certains textes suivent des règles
          particulières (budget, révision constitutionnelle, procédure accélérée). Poligraph est un
          outil d{"'"}information citoyenne et ne constitue pas une source juridique.
        </p>
      </div>
    </>
  );
}
