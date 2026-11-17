import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { BRAND_RED } from "@/config/brand";
import { getCommuneDossier } from "@/lib/data/territoires";
import { OgLayout, OG_SIZE } from "@/lib/og-utils";
import { getDepartmentShapeWithDot } from "@/lib/og-department-shape";
import { communePhraseReponse } from "@/lib/territoires/commune-bandeau";
import { formatPopulation, natureLabel, territoireLabel } from "@/lib/territoires/commune-display";
import { phraseTexte, territoireOg, TERRITOIRE_OG_SHAPE } from "@/lib/territoires/og";
import { communeCodeFromSegment, isCommuneSegment } from "@/lib/territoires/paths";

export const alt = "Commune sur Poligraph : maire, élus et résultats";
export const size = OG_SIZE;
export const contentType = "image/png";

// The image is built on first request and then served from the cache, like the page it
// illustrates. Without `generateStaticParams`, a `revalidate` on an image whose address carries a
// parameter is ignored and the image is rebuilt on every request (measured in production).
// Empty on purpose: nothing is built ahead, there are 35,000 communes.
export const revalidate = 86400;
export function generateStaticParams() {
  return [];
}

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  // Same reader and same sentence as the page: only a public, established mayor is ever named.
  const inseeCode = communeCodeFromSegment(code);
  const dossier = inseeCode ? await getCommuneDossier(inseeCode) : null;
  if (!dossier || !isCommuneSegment(code, inseeCode!, dossier.identity.name)) notFound();

  const { identity, population } = dossier;
  const faits = [
    population.value != null ? formatPopulation(population.value) : null,
    identity.territoireHorsRegion ? `${identity.territoireHorsRegion.statut} hors région` : null,
  ].filter((f): f is string => f !== null);

  // Overseas communes use their territory's own outline; TAAF and Clipperton get none.
  const shape = getDepartmentShapeWithDot(
    identity.department.code,
    identity.coordinates?.lat ?? null,
    identity.coordinates?.lon ?? null,
    { width: TERRITOIRE_OG_SHAPE, height: TERRITOIRE_OG_SHAPE },
    { shapeFill: "#ffffff", dotFill: BRAND_RED, dotRadius: 9 }
  );

  return new ImageResponse(
    <OgLayout>
      {territoireOg({
        surtitre: `${natureLabel(identity)} · ${territoireLabel(identity)}`,
        nom: identity.name,
        code: identity.inseeCode,
        phrase: phraseTexte(communePhraseReponse(dossier)),
        faits,
        shape,
      })}
    </OgLayout>,
    { ...OG_SIZE }
  );
}
