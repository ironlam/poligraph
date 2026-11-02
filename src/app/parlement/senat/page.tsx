import type { Metadata } from "next";
import { ChambrePage } from "@/components/parlement/ChambrePage";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";
import { CHAMBER_PROFILES } from "@/config/chambres";
import { SITE_URL } from "@/config/site";
import { ROUTES } from "@/config/routes";
import { getChamberOverview } from "@/lib/data/chambres";

export const revalidate = 3600;

const profile = CHAMBER_PROFILES.SENAT;

export const metadata: Metadata = {
  title: "Sénat : rôle, sénateurs et scrutins",
  description:
    "À quoi sert le Sénat, en quoi il diffère de l'Assemblée nationale et où suivre ses scrutins, ses lois en construction et ses 348 sénateurs.",
  alternates: { canonical: ROUTES.senat },
};

export default async function SenatPage() {
  const overview = await getChamberOverview("SENAT");
  return (
    <>
      <CollectionPageJsonLd
        name={profile.name}
        description={profile.intro}
        url={`${SITE_URL}${ROUTES.senat}`}
        numberOfItems={overview.totalScrutins}
      />
      <ChambrePage chamber="SENAT" overview={overview} />
    </>
  );
}
