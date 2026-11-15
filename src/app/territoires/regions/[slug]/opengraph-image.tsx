import { ImageResponse } from "next/og";
import { getRegionTerritoire } from "@/lib/data/territoires";
import { regionOutlineDataUri } from "@/lib/territoires/region-og-shape";
import { OgLayout, OG_SIZE } from "@/lib/og-utils";
import { formatCompte } from "@/lib/territoires/format";
import { phraseTexte, territoireOg } from "@/lib/territoires/og";
import { regionPhraseReponse } from "@/lib/territoires/region-bandeau";

export const alt = "Région sur Poligraph";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getRegionTerritoire(slug);

  if (!data) {
    return new ImageResponse(
      <OgLayout>
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: 32,
          }}
        >
          Région introuvable
        </div>
      </OgLayout>,
      { ...OG_SIZE }
    );
  }

  const { region } = data;
  return new ImageResponse(
    <OgLayout>
      {territoireOg({
        surtitre: `Région · ${formatCompte(data.departements.length, "département", "départements")}`,
        nom: region.name,
        code: region.code,
        // Same sentence as the page banner.
        phrase: phraseTexte(regionPhraseReponse(data)),
        faits: [
          formatCompte(data.communeCount, "commune", "communes"),
          `chef-lieu ${region.chefLieu.name}`,
        ],
        shape: regionOutlineDataUri(region.name),
      })}
    </OgLayout>,
    { ...OG_SIZE }
  );
}
