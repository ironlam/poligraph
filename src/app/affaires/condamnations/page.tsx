import type { Metadata } from "next";
import { z } from "zod";
import { db } from "@/lib/db";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { CondamnationCard } from "@/components/affairs/CondamnationCard";
import { CondamnationsFilters } from "@/components/affairs/CondamnationsFilters";
import { CondamnationsStatsTable } from "@/components/affairs/CondamnationsStatsTable";
import { CondamnationsPresumptionBanner } from "@/components/affairs/CondamnationsPresumptionBanner";
import { getCondamnations, getCondamnationsStatsByParty } from "@/lib/data/condamnations";
import { getPartiesWithAffairs } from "@/lib/data/affairs";
import { buildListTitle, buildDescription, buildCanonical } from "@/lib/seo/condamnations-metadata";
import { CollectionPageJsonLd, AffairItemListJsonLd, DatasetJsonLd } from "@/components/seo/JsonLd";
import { SITE_URL } from "@/config/site";

export const revalidate = 300;

const searchParamsSchema = z.object({
  mandat: z.enum(["depute", "senateur", "gouvernement", "locaux"]).optional(),
  certainty: z.enum(["etabli", "prononcee", "tous"]).default("tous"),
  parti: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  view: z.enum(["list", "stats"]).default("list"),
  page: z.coerce.number().int().min(1).max(100).default(1),
  sort: z.enum(["date", "nom", "severity"]).default("date"),
});

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function getPartyNameFromSlug(slug?: string): Promise<string | null> {
  if (!slug) return null;
  const p = await db.party.findUnique({
    where: { slug },
    select: { shortName: true, name: true },
  });
  return p ? `${p.name} (${p.shortName})` : null;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const raw = await searchParams;
  const parsed = searchParamsSchema.safeParse(raw);
  const params = parsed.success ? parsed.data : searchParamsSchema.parse({});

  const partyName = await getPartyNameFromSlug(params.parti);

  const [totalDef, totalPro] = await Promise.all([
    db.affair.count({
      where: {
        publicationStatus: "PUBLISHED",
        involvement: { in: ["DIRECT", "INDIRECT"] },
        status: "CONDAMNATION_DEFINITIVE",
      },
    }),
    db.affair.count({
      where: {
        publicationStatus: "PUBLISHED",
        involvement: { in: ["DIRECT", "INDIRECT"] },
        status: { in: ["CONDAMNATION_PREMIERE_INSTANCE", "APPEL_EN_COURS"] },
      },
    }),
  ]);

  const titleBase =
    params.view === "stats"
      ? "Taux de condamnation par parti politique"
      : buildListTitle({
          mandat: params.mandat,
          certainty: params.certainty,
          partyName,
        });

  const title = `${titleBase} | Poligraph`;
  const description = buildDescription({
    mandat: params.mandat,
    certainty: params.certainty,
    view: params.view,
    partyName,
    totalDefinitif: totalDef,
    totalPrononce: totalPro,
  });
  const canonical = buildCanonical({
    mandat: params.mandat,
    certainty: params.certainty,
    partiSlug: params.parti,
    view: params.view,
  });

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function CondamnationsPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const parsed = searchParamsSchema.safeParse(raw);
  const params = parsed.success ? parsed.data : searchParamsSchema.parse({});

  const partyName = await getPartyNameFromSlug(params.parti);
  const parties = await getPartiesWithAffairs();

  const h1 =
    params.view === "stats"
      ? "Taux de condamnation par parti politique"
      : buildListTitle({
          mandat: params.mandat,
          certainty: params.certainty,
          partyName,
        });

  const breadcrumbItems: Array<{ label: string; href?: string }> = [
    { label: "Affaires", href: "/affaires" },
    { label: "Condamnations" },
  ];

  // STATS VIEW
  if (params.view === "stats") {
    const stats = await getCondamnationsStatsByParty(params.mandat);
    return (
      <>
        <DatasetJsonLd
          name="Taux de condamnation par parti politique en France"
          description="Agrégation du nombre et du taux de responsables politiques condamnés définitivement par parti d'appartenance"
          url={`${SITE_URL}/affaires/condamnations?view=stats`}
        />
        <div className="container mx-auto px-4 pt-4 pb-8">
          <Breadcrumb items={breadcrumbItems} />
          <h1 className="text-3xl font-display font-extrabold tracking-tight mb-2">{h1}</h1>
          <p className="text-muted-foreground mb-6">
            Répartition des responsables politiques condamnés définitivement par leur parti d{"'"}
            appartenance. Sources vérifiables.
          </p>
          <CondamnationsFilters
            current={{
              mandat: params.mandat,
              certainty: params.certainty,
              parti: params.parti,
              view: params.view,
            }}
            parties={parties.map((p) => ({
              slug: p.slug as string,
              shortName: p.shortName,
              name: p.name,
            }))}
          />
          <CondamnationsStatsTable rows={stats} currentMandat={params.mandat} />
        </div>
      </>
    );
  }

  // LIST VIEW
  const [listDef, listNonDef] = await Promise.all([
    params.certainty === "prononcee"
      ? Promise.resolve(null)
      : getCondamnations({
          mandat: params.mandat,
          certainty: "etabli",
          partiSlug: params.parti,
          page: params.page,
          sort: params.sort,
        }),
    params.certainty === "etabli"
      ? Promise.resolve(null)
      : getCondamnations({
          mandat: params.mandat,
          certainty: "prononcee",
          partiSlug: params.parti,
          page: params.page,
          sort: params.sort,
        }),
  ]);

  const totalDefinitif = listDef?.total ?? 0;
  const totalPrononce = listNonDef?.total ?? 0;

  const allAffairs = [...(listDef?.affairs ?? []), ...(listNonDef?.affairs ?? [])];

  return (
    <>
      <CollectionPageJsonLd
        name={h1}
        description=""
        url={`${SITE_URL}${buildCanonical({
          mandat: params.mandat,
          certainty: params.certainty,
          partiSlug: params.parti,
          view: "list",
        })}`}
        numberOfItems={totalDefinitif + totalPrononce}
      />
      {allAffairs.length > 0 && (
        <AffairItemListJsonLd
          name={h1}
          items={allAffairs.map((a) => ({
            url: `${SITE_URL}/affaires/${a.slug}`,
            name: a.title,
          }))}
        />
      )}
      <div className="container mx-auto px-4 pt-4 pb-8">
        <Breadcrumb items={breadcrumbItems} />
        <h1 className="text-3xl font-display font-extrabold tracking-tight mb-2">{h1}</h1>
        <p className="text-muted-foreground mb-6">
          {totalDefinitif > 0 &&
            `${totalDefinitif} condamnation${totalDefinitif !== 1 ? "s" : ""} définitive${totalDefinitif !== 1 ? "s" : ""}`}
          {totalDefinitif > 0 && totalPrononce > 0 && " · "}
          {totalPrononce > 0 && `${totalPrononce} en première instance ou en appel`}
          {totalDefinitif === 0 &&
            totalPrononce === 0 &&
            "Aucune décision ne correspond à ces filtres."}
        </p>

        <CondamnationsFilters
          current={{
            mandat: params.mandat,
            certainty: params.certainty,
            parti: params.parti,
            view: params.view,
          }}
          parties={parties.map((p) => ({
            slug: p.slug as string,
            shortName: p.shortName,
            name: p.name,
          }))}
        />

        {listDef && listDef.affairs.length > 0 && (
          <section aria-labelledby="heading-definitives" className="mb-10">
            <h2 id="heading-definitives" className="text-2xl font-display font-bold mb-4">
              Condamnations définitives
            </h2>
            <div className="space-y-3">
              {listDef.affairs.map((a) => (
                <CondamnationCard
                  key={a.id}
                  affair={a as Parameters<typeof CondamnationCard>[0]["affair"]}
                  definitif
                />
              ))}
            </div>
          </section>
        )}

        {listNonDef && listNonDef.affairs.length > 0 && (
          <section aria-labelledby="heading-non-definitives" className="mb-10">
            <h2 id="heading-non-definitives" className="text-2xl font-display font-bold mb-2">
              Condamnations non définitives
            </h2>
            <CondamnationsPresumptionBanner />
            <div className="space-y-3">
              {listNonDef.affairs.map((a) => (
                <CondamnationCard
                  key={a.id}
                  affair={a as Parameters<typeof CondamnationCard>[0]["affair"]}
                  definitif={false}
                />
              ))}
            </div>
          </section>
        )}

        {/* Methodology footer */}
        <section className="mt-12 border-t border-border pt-6">
          <h2 className="text-xl font-semibold mb-2">Méthodologie</h2>
          <p className="text-sm text-muted-foreground">
            Chaque condamnation listée est documentée avec au moins une source journalistique
            vérifiable ou une décision de justice publiée. Les données proviennent de Wikidata, de
            la presse, de Judilibre et de contributions modérées. Une personne citée peut demander
            correction via{" "}
            <a href="mailto:contact@poligraph.fr" className="text-primary hover:underline">
              contact@poligraph.fr
            </a>
            . Voir la{" "}
            <a href="/sources" className="text-primary hover:underline">
              page Sources
            </a>{" "}
            pour la méthodologie complète et la{" "}
            <a href="/docs/api" className="text-primary hover:underline">
              documentation API
            </a>{" "}
            pour la reproduction des données.
          </p>
        </section>
      </div>
    </>
  );
}
