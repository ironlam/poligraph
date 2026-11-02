import type { Metadata } from "next";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { GroupCard } from "@/components/groupes/GroupCard";
import { getGroupesListing } from "@/lib/data/groupes";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Groupes parlementaires",
  description:
    "Groupes parlementaires de l'Assemblée nationale et du Sénat : composition, cohésion et positions de vote.",
  alternates: { canonical: "/parlement/groupes" },
};

export default async function GroupesPage() {
  const groups = await getGroupesListing({ includeGovernmentProjectPositions: true });

  const sorted = [...groups]
    .filter((g) => g.seatCount > 0)
    .sort((a, b) => b.seatCount - a.seatCount);
  const anGroups = sorted.filter((g) => g.chamber === "AN");
  const senatGroups = sorted.filter((g) => g.chamber === "SENAT");

  return (
    <div className="container mx-auto px-4 py-8">
      <CollectionPageJsonLd
        name="Groupes parlementaires"
        description="Groupes parlementaires de l'Assemblée nationale et du Sénat : composition, cohésion et positions de vote."
        url="https://poligraph.fr/parlement/groupes"
        numberOfItems={sorted.length}
      />
      <Breadcrumb
        items={[{ label: "Parlement", href: "/parlement" }, { label: "Groupes parlementaires" }]}
      />

      <div className="mb-8">
        <h1 className="text-3xl font-display font-extrabold tracking-tight mb-1">
          Groupes parlementaires
        </h1>
        <p className="text-sm text-muted-foreground">{groups.length} groupes actifs</p>
      </div>

      {anGroups.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Assemblée nationale</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {anGroups.map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </div>
        </section>
      )}

      {senatGroups.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Sénat</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {senatGroups.map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
