import { ImageResponse } from "next/og";
import { getDepartmentBySlug } from "@/config/departments";
import { remplaceLeDepartement } from "@/components/territoires/DepartementConseil";
import { getDepartementTerritoire } from "@/lib/data/territoires";
import { OgLayout, OG_SIZE } from "@/lib/og-utils";
import { getDepartmentShapeDataUri } from "@/lib/og-department-shape";
import { departementPhraseReponse } from "@/lib/territoires/departement-bandeau";
import { formatCompte } from "@/lib/territoires/format";
import { phraseTexte, territoireOg, TERRITOIRE_OG_SHAPE } from "@/lib/territoires/og";

export const alt = "Département sur Poligraph";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dept = getDepartmentBySlug(slug);
  // Same reader, same arguments as the page, so both share one cache entry and say the same.
  const territoire = dept
    ? await getDepartementTerritoire(dept.code, { letter: null, page: 1 })
    : null;

  if (!dept || !territoire) {
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
          Département non trouvé
        </div>
      </OgLayout>,
      { ...OG_SIZE }
    );
  }

  const { region, territoireHorsRegion, parlement } = territoire;
  // An empty count is left out of the image rather than drawn as a zero.
  const faits = [
    territoire.communeCount > 0
      ? formatCompte(territoire.communeCount, "commune", "communes")
      : null,
    parlement.deputeCount > 0 ? formatCompte(parlement.deputeCount, "député", "députés") : null,
    parlement.senateurCount > 0
      ? formatCompte(parlement.senateurCount, "sénateur", "sénateurs")
      : null,
  ].filter((f): f is string => f !== null);

  return new ImageResponse(
    <OgLayout>
      {territoireOg({
        surtitre: territoireHorsRegion
          ? territoireHorsRegion.statut
          : `Département${region ? ` · ${region.name}` : ""}`,
        nom: dept.name,
        code: dept.code,
        phrase: phraseTexte(
          departementPhraseReponse(
            territoire,
            remplaceLeDepartement(territoire.collectivitesParticulieres)
          )
        ),
        faits,
        shape: getDepartmentShapeDataUri(
          dept.code,
          { width: TERRITOIRE_OG_SHAPE, height: TERRITOIRE_OG_SHAPE },
          "#ffffff"
        ),
        shapeOpacity: 0.3,
      })}
    </OgLayout>,
    { ...OG_SIZE }
  );
}
