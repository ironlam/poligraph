import { notFound } from "next/navigation";
import Link from "next/link";
import { getAdminCandidacyThemeSyntheses } from "@/lib/data/candidacy-theme-syntheses";
import { ThemeSynthesesClient } from "./ThemeSynthesesClient";

export const metadata = {
  title: "Synthèses thématiques (admin) | Poligraph",
  robots: { index: false },
};

export const maxDuration = 120;

export default async function AdminThemeSynthesesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getAdminCandidacyThemeSyntheses(slug);
  if (!data) notFound();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/admin/candidats"
          className="text-sm font-semibold text-primary hover:underline"
        >
          Retour aux candidatures
        </Link>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Synthèses thématiques de {data.candidateName}
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Chaque texte utilise uniquement les mesures publiées du thème. Une génération reste
          invisible sur le site jusqu’à sa relecture et sa publication explicite.
        </p>
      </header>

      <ThemeSynthesesClient data={data} />
    </div>
  );
}
