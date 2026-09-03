import { Metadata } from "next";
import { notFound } from "next/navigation";
import { CarteClient } from "./CarteClient";
import { getElectionMapData } from "@/services/electionMap";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { Breadcrumb } from "@/components/ui/Breadcrumb";

export const revalidate = 300; // ISR: re-check feature flag every 5 minutes

export const metadata: Metadata = {
  title: "Carte des Résultats Électoraux",
  description:
    "Carte interactive des résultats électoraux par département. Visualisez la répartition politique des sièges aux législatives 2024 en France métropolitaine et outre-mer.",
  openGraph: {
    title: "Carte des Résultats Électoraux | Poligraph",
    description:
      "Carte interactive des résultats électoraux par département. Visualisez la répartition politique des sièges aux législatives 2024.",
    type: "website",
  },
  alternates: { canonical: "/carte" },
};

export default async function CartePage() {
  if (!(await isFeatureEnabled("CARTE_SECTION"))) notFound();

  const { departments, totalSeats } = await getElectionMapData();

  return (
    <>
      <div className="container mx-auto px-4 pt-4 pb-8">
        <Breadcrumb items={[{ label: "Carte" }]} />
        <div className="mb-8">
          <h1 className="text-3xl font-display font-extrabold tracking-tight mb-2">
            Carte des Résultats Électoraux
          </h1>
          <p className="text-muted-foreground">
            Visualisez les résultats des législatives 2024 par département. Cliquez sur un
            département pour voir les détails.
          </p>
        </div>

        <CarteClient initialDepartments={departments} totalSeats={totalSeats} />
      </div>
    </>
  );
}
