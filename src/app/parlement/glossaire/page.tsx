import type { Metadata } from "next";
import Link from "next/link";
import {
  BandeauFilAriane,
  BandeauSurtitre,
  RubriqueBandeau,
} from "@/components/ui/RubriqueBandeau";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";
import { GLOSSAIRE_PARLEMENT, glossaireParLettre } from "@/config/glossaire-parlement";
import { ROUTES } from "@/config/routes";
import { SITE_URL } from "@/config/site";

export const revalidate = 86400;

const DESCRIPTION =
  "Scrutin, navette, CMP : le vocabulaire parlementaire expliqué simplement, pour suivre un texte de loi sans être spécialiste.";

export const metadata: Metadata = {
  title: "Les mots du Parlement : glossaire",
  description: DESCRIPTION,
  alternates: { canonical: ROUTES.glossaire },
};

export default function GlossairePage() {
  const groupes = glossaireParLettre();
  const parId = new Map(GLOSSAIRE_PARLEMENT.map((t) => [t.id, t]));

  return (
    <>
      <CollectionPageJsonLd
        name="Les mots du Parlement"
        description={DESCRIPTION}
        url={`${SITE_URL}${ROUTES.glossaire}`}
        numberOfItems={GLOSSAIRE_PARLEMENT.length}
      />
      <RubriqueBandeau labelledBy="glossaire-titre">
        <div className="max-w-3xl">
          <BandeauFilAriane
            items={[{ label: "Parlement", href: ROUTES.parlement }, { label: "Glossaire" }]}
          />
          <div className="mt-4">
            <BandeauSurtitre>Comprendre</BandeauSurtitre>
          </div>
          <h1
            id="glossaire-titre"
            className="mt-4 font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl"
          >
            Les mots du Parlement
          </h1>
          <p className="mt-4 max-w-2xl text-base text-white/85 sm:text-lg">{DESCRIPTION}</p>
        </div>
      </RubriqueBandeau>

      <div className="container mx-auto max-w-5xl px-4 py-8">
        <nav aria-label="Index alphabétique" className="flex flex-wrap gap-2">
          {groupes.map(({ lettre }) => (
            <a
              key={lettre}
              href={`#lettre-${lettre}`}
              className="inline-flex h-11 min-w-11 items-center justify-center rounded-lg border border-border bg-card font-bold text-primary hover:bg-muted"
            >
              {lettre}
            </a>
          ))}
        </nav>

        {groupes.map(({ lettre, termes }) => (
          <section
            key={lettre}
            id={`lettre-${lettre}`}
            aria-labelledby={`titre-${lettre}`}
            className="mt-8 scroll-mt-20"
          >
            <h2
              id={`titre-${lettre}`}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary font-display text-xl font-extrabold text-primary-foreground"
            >
              {lettre}
            </h2>
            <dl className="mt-4 grid gap-3 md:grid-cols-2">
              {termes.map((t) => (
                <div
                  key={t.id}
                  id={t.id}
                  className="scroll-mt-20 rounded-2xl border border-border bg-card p-5"
                >
                  <dt className="font-display text-lg font-bold text-primary">{t.terme}</dt>
                  <dd className="mt-1 text-sm leading-relaxed">{t.definition}</dd>
                  {t.voirAussi && (
                    <dd className="mt-2 text-sm text-muted-foreground">
                      Voir aussi :{" "}
                      {t.voirAussi.map((id, i) => (
                        <span key={id}>
                          {i > 0 && ", "}
                          <a href={`#${id}`} className="font-bold text-primary hover:underline">
                            {parId.get(id)?.terme}
                          </a>
                        </span>
                      ))}
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          </section>
        ))}

        <aside className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5">
          <p className="max-w-xl text-sm">
            Pour voir ces mots à l{"'"}œuvre, suivez le trajet d{"'"}un texte entre les deux
            chambres.
          </p>
          <Link
            href={ROUTES.parcoursLegislatif}
            className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
          >
            Voir le parcours d{"'"}une loi
          </Link>
        </aside>

        <p className="mt-8 max-w-3xl text-xs text-muted-foreground">
          Définitions simplifiées à visée pédagogique. Poligraph est un outil d{"'"}information
          citoyenne et ne constitue pas une source juridique.
        </p>
      </div>
    </>
  );
}
