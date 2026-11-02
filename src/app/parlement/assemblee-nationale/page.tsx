import type { Metadata } from "next";
import { ChambrePage } from "@/components/parlement/ChambrePage";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";
import { CHAMBER_PROFILES } from "@/config/chambres";
import { SITE_URL } from "@/config/site";
import { ROUTES } from "@/config/routes";
import { getChamberOverview } from "@/lib/data/chambres";

export const revalidate = 3600;

const profile = CHAMBER_PROFILES.AN;

export const metadata: Metadata = {
  title: "Assemblée nationale : rôle, députés et scrutins",
  description:
    "À quoi sert l'Assemblée nationale, comment elle vote et où suivre ses scrutins, ses lois en construction et ses 577 députés.",
  alternates: { canonical: ROUTES.assembleeNationale },
};

export default async function AssembleeNationalePage() {
  const overview = await getChamberOverview("AN");
  return (
    <>
      <CollectionPageJsonLd
        name={profile.name}
        description={profile.intro}
        url={`${SITE_URL}${ROUTES.assembleeNationale}`}
        numberOfItems={overview.totalScrutins}
      />
      <ChambrePage chamber="AN" overview={overview} />
    </>
  );
}
