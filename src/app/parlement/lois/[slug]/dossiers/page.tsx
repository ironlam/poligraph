import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDossierAliasMatches } from "@/lib/data/dossier-aliases";
import { DossierAliasChoices } from "@/components/legislation/DossierAliasChoices";

// This utility choice must never compete with the canonical dossier pages.
export const metadata: Metadata = {
  title: "Nom d’usage partagé : choisir un dossier",
  robots: { index: false, follow: true },
};

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const matches = await getDossierAliasMatches((await params).slug);
  if (!matches.length) notFound();
  return <DossierAliasChoices matches={matches} />;
}
