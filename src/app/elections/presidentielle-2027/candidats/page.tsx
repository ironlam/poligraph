import type { Metadata } from "next";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { getHubCandidacyField } from "@/lib/data/hub";
import { formatCandidacyFieldSummary } from "@/lib/presidentielle/candidacy-filters";
import { PRESIDENTIELLE_2027_SLUG } from "@/lib/presidentielle/themes";
import { HubCandidacyField } from "../_components/HubCandidacyField";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Candidatures et personnalités suivies, présidentielle 2027 | Poligraph",
  description:
    "Les candidatures annoncées et les personnalités suivies pour la présidentielle 2027, avec leur statut sourcé et les propositions publiées sur Poligraph.",
  alternates: { canonical: "/elections/presidentielle-2027/candidats" },
};

export default async function PresidentialCandidatesPage() {
  const candidacies = await getHubCandidacyField(PRESIDENTIELLE_2027_SLUG);
  return (
    <div className="container mx-auto space-y-8 px-4 pb-10 pt-4">
      <Breadcrumb
        items={[
          { label: "Élections", href: "/elections" },
          { label: "Présidentielle 2027", href: "/elections/presidentielle-2027" },
          { label: "Candidatures" },
        ]}
      />
      <header className="max-w-4xl space-y-3">
        <p className="text-xs font-bold uppercase tracking-widest text-brand">
          Présidentielle 2027
        </p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-5xl">
          Candidatures et personnalités suivies
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
          {formatCandidacyFieldSummary(candidacies)}
        </p>
      </header>
      <HubCandidacyField candidacies={candidacies} />
    </div>
  );
}
