import { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { themeToSlug } from "@/lib/theme-utils";
import { Card, CardContent } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { SeoIntro } from "@/components/seo/SeoIntro";
import {
  THEME_CATEGORY_LABELS,
  THEME_CATEGORY_ICONS,
  THEME_CATEGORY_COLORS,
} from "@/config/labels";
import type { ThemeCategory } from "@/types";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Votes par thématique",
  description:
    "Explorez les scrutins parlementaires classés par thématique : économie, santé, sécurité, environnement et plus. Découvrez les votes de vos représentants par sujet.",
  alternates: { canonical: "/parlement/votes/themes" },
};

export default async function ThemesListingPage() {
  const [themeCounts, themeAdoptedCounts] = await Promise.all([
    db.scrutin.groupBy({
      by: ["theme"],
      where: { theme: { not: null } },
      _count: true,
    }),
    db.scrutin.groupBy({
      by: ["theme"],
      where: { theme: { not: null }, result: "ADOPTED" },
      _count: true,
    }),
  ]);

  const adoptedMap = new Map(
    themeAdoptedCounts
      .filter((t) => t.theme !== null)
      .map((t) => [t.theme as ThemeCategory, t._count])
  );

  const themes = themeCounts
    .filter((t) => t.theme !== null)
    .map((t) => {
      const theme = t.theme as ThemeCategory;
      const total = t._count;
      const adopted = adoptedMap.get(theme) || 0;
      const adoptedPercent = total > 0 ? Math.round((adopted / total) * 100) : 0;
      return { theme, total, adopted, adoptedPercent };
    })
    .sort((a, b) => b.total - a.total);

  const totalScrutins = themes.reduce((sum, t) => sum + t.total, 0);

  return (
    <div className="container mx-auto px-4 pt-4 pb-8">
      <Breadcrumb
        items={[
          { label: "Parlement", href: "/parlement" },
          { label: "Votes", href: "/parlement/votes" },
          { label: "Thématiques" },
        ]}
      />

      <h1 className="text-3xl font-display font-extrabold tracking-tight mb-2">
        Votes par thématique
      </h1>
      <SeoIntro
        text={`${totalScrutins.toLocaleString("fr-FR")} scrutins parlementaires classés dans ${themes.length} thématiques. Explorez les votes de l'Assemblée nationale et du Sénat par sujet.`}
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {themes.map(({ theme, total, adoptedPercent }) => {
          const slug = themeToSlug(theme);
          const label = THEME_CATEGORY_LABELS[theme];
          const icon = THEME_CATEGORY_ICONS[theme];
          const colorClass = THEME_CATEGORY_COLORS[theme];

          return (
            <Link key={theme} href={`/parlement/votes/themes/${slug}`}>
              <Card className="hover:shadow-md transition-shadow h-full">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`px-2 py-1 rounded text-lg ${colorClass}`}>{icon}</span>
                    <h2 className="font-semibold text-base">{label}</h2>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{total.toLocaleString("fr-FR")} scrutins</span>
                    <span className="text-green-600 font-medium">{adoptedPercent}% adoptés</span>
                  </div>
                  <div
                    className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={adoptedPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Taux d'adoption : ${adoptedPercent}%`}
                  >
                    <div
                      className="h-full rounded-full bg-green-600 dark:bg-green-500"
                      style={{ width: `${adoptedPercent}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="mt-8 text-center text-sm text-muted-foreground">
        <p>
          Données issues de{" "}
          <a
            href="https://data.assemblee-nationale.fr"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            data.assemblee-nationale.fr
          </a>{" "}
          et{" "}
          <a
            href="https://www.senat.fr/scrutin-public/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            senat.fr
          </a>{" "}
          (Open Data officiel)
        </p>
      </div>
    </div>
  );
}
