import Image from "next/image";
import { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PoliticalPositionBadge } from "@/components/partis/PoliticalPositionBadge";
import { PartiesFilterBar } from "@/components/partis/PartiesFilterBar";
import { SeoIntro } from "@/components/seo/SeoIntro";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";
import { SITE_URL } from "@/config/site";
import { getParties, getPartiesStats } from "@/lib/data/partis";
import { listingRobotsMetadata, hasActiveListingFilter } from "@/lib/seo/listing-robots";
import type { SortOption, StatusFilter } from "@/lib/data/partis";
import { PoliticalPosition } from "@/generated/prisma";
import { pickEnumValue } from "@/lib/data/enum-guards";
import { Breadcrumb } from "@/components/ui/Breadcrumb";

export const revalidate = 300; // 5 minutes, cohérent avec l'API

interface PageProps {
  searchParams: Promise<{
    search?: string;
    position?: string;
    status?: string;
    sort?: string;
  }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  return {
    title: "Partis politiques",
    description: "Liste des partis politiques français avec leurs membres et historique",
    // Filtered variants: noindex,follow, canonical consolidates on the bare listing.
    ...listingRobotsMetadata(
      hasActiveListingFilter(params, ["search", "position", "status", "sort"])
    ),
    alternates: { canonical: "/partis" },
  };
}

export default async function PartiesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search || "";
  const position = pickEnumValue(params.position, PoliticalPosition);
  const statusFilter = (params.status || "actifs") as StatusFilter;
  const sort = (params.sort || "members") as SortOption;

  const [parties, stats] = await Promise.all([
    getParties(search || undefined, position || undefined, statusFilter, sort),
    getPartiesStats(),
  ]);

  const isFiltered = !!(search || position || statusFilter !== "actifs" || sort !== "members");

  return (
    <>
      <CollectionPageJsonLd
        name="Partis politiques français"
        description="Partis politiques français avec leurs membres, orientation politique et historique."
        url={`${SITE_URL}/partis`}
        numberOfItems={parties.length}
      />
      <div className="container mx-auto px-4 pt-4 pb-8">
        <Breadcrumb items={[{ label: "Partis" }]} />
        <div className="mb-6">
          <h1 className="text-3xl font-display font-extrabold tracking-tight mb-1">
            Partis politiques
          </h1>
          <p className="text-sm text-muted-foreground">
            Partis politiques français avec leurs membres et historique
          </p>
          <div className="sr-only">
            <SeoIntro
              text={`${stats.actifs} partis politiques français actifs référencés sur Poligraph, avec leurs membres, orientation politique et affaires judiciaires.`}
            />
          </div>
        </div>

        <PartiesFilterBar
          currentFilters={{
            search,
            position: position || "",
            status: statusFilter,
            sort,
          }}
          total={parties.length}
        />

        {/* Active filters summary */}
        {isFiltered && (
          <div className="mb-6 flex items-center gap-2 text-sm flex-wrap">
            <span className="text-muted-foreground">Filtres actifs :</span>
            {search && <Badge variant="outline">Recherche : {search}</Badge>}
            {position && <Badge variant="outline">Orientation : {position}</Badge>}
            {statusFilter && statusFilter !== "actifs" && (
              <Badge variant="outline">
                {statusFilter === "historiques" ? "Historiques" : "Tous"}
              </Badge>
            )}
            {sort !== "members" && (
              <Badge variant="outline">Tri : {sort === "alpha" ? "A-Z" : "Z-A"}</Badge>
            )}
            <Link href="/partis" className="text-primary hover:underline ml-2">
              Réinitialiser
            </Link>
          </div>
        )}

        {/* Results grid */}
        {parties.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {parties.map((party) => (
              <Link key={party.id} href={`/partis/${party.slug}`} prefetch={false}>
                <Card
                  className={`h-full hover:shadow-md transition-shadow ${
                    party.dissolvedDate ? "opacity-75 hover:opacity-100" : ""
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {party.logoUrl ? (
                        <Image
                          src={party.logoUrl}
                          alt={party.name}
                          width={48}
                          height={48}
                          className="w-12 h-12 object-contain shrink-0"
                        />
                      ) : (
                        <div
                          className="w-12 h-12 rounded-lg flex items-center justify-center text-lg font-bold text-white shrink-0"
                          style={{ backgroundColor: party.color || "#888" }}
                        >
                          {party.shortName.substring(0, 2)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold">{party.name}</h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="outline" className="text-xs" title={party.name}>
                            {party.shortName}
                          </Badge>
                          {party.politicalPosition && (
                            <PoliticalPositionBadge
                              position={party.politicalPosition}
                              source={party.politicalPositionSource}
                              className="text-xs"
                            />
                          )}
                          {party.dissolvedDate && (
                            <Badge variant="secondary" className="text-xs">
                              Dissous
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground flex-wrap">
                          {party._count.politicians > 0 && (
                            <span>{party._count.politicians} membres</span>
                          )}
                          {party.dissolvedDate && party._count.partyMemberships > 0 && (
                            <span>{party._count.partyMemberships} anciens membres</span>
                          )}
                          {party.affairCounts.condamnations > 0 && (
                            <span className="text-amber-600 dark:text-amber-400 font-medium">
                              {party.affairCounts.condamnations} condamnation
                              {party.affairCounts.condamnations > 1 ? "s" : ""} définitive
                              {party.affairCounts.condamnations > 1 ? "s" : ""}
                            </span>
                          )}
                          {party.affairCounts.enCours > 0 && (
                            <span className="text-amber-600 dark:text-amber-400">
                              {party.affairCounts.enCours} procédure
                              {party.affairCounts.enCours > 1 ? "s" : ""} en cours
                            </span>
                          )}
                          {party.affairCounts.closesSansCondamnation > 0 && (
                            <span>
                              {party.affairCounts.closesSansCondamnation} classée
                              {party.affairCounts.closesSansCondamnation > 1 ? "s" : ""} sans
                              condamnation
                            </span>
                          )}
                        </div>
                        {party.predecessor ? (
                          <p className="text-xs text-muted-foreground mt-1">
                            Succède à {party.predecessor.shortName}
                          </p>
                        ) : party.foundedDate ? (
                          <p className="text-xs text-muted-foreground mt-1">
                            Fondé en {new Date(party.foundedDate).getFullYear()}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-2">Aucun parti trouvé</p>
              <p className="text-sm text-muted-foreground">
                Essayez de modifier vos filtres ou{" "}
                <Link href="/partis" className="text-primary hover:underline">
                  réinitialisez la recherche
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
