import type { ReactNode } from "react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";
import { SITE_URL } from "@/config/site";
import { statsHref, type StatsTab } from "@/config/routes";
import type { PresidentialOverviewStats } from "@/lib/data/presidential-stats";
import { PresidentialEntry } from "./PresidentialEntry";
import { StatsTabs } from "./StatsTabs";

const SECTION_LABELS: Record<StatsTab, string> = {
  judiciaire: "Judiciaire",
  factchecks: "Fact-checking",
  legislatif: "Législatif",
  participation: "Participation",
};

export function StatisticsPageLayout({
  active,
  title,
  description,
  children,
  presidentialStats,
}: {
  active: StatsTab;
  title: string;
  description: string;
  children: ReactNode;
  presidentialStats?: PresidentialOverviewStats | null;
}) {
  const path = statsHref(active);
  return (
    <>
      <CollectionPageJsonLd name={title} description={description} url={`${SITE_URL}${path}`} />
      <div className="container mx-auto px-4 pb-8 pt-4">
        <Breadcrumb
          items={
            active === "judiciaire"
              ? [{ label: "Statistiques" }]
              : [
                  { label: "Statistiques", href: "/statistiques" },
                  { label: SECTION_LABELS[active] },
                ]
          }
        />
        <h1 className="mb-2 font-display text-3xl font-extrabold tracking-tight">{title}</h1>
        <p className="mb-8 text-muted-foreground">{description}</p>
        <StatsTabs active={active}>{children}</StatsTabs>
        {presidentialStats ? <PresidentialEntry stats={presidentialStats} /> : null}
      </div>
    </>
  );
}
