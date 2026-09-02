import { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ElectionCountdown, ElectionTimeline } from "@/components/elections";
import { ELECTION_TYPE_LABELS, ELECTION_TYPE_ICONS } from "@/config/labels";
import { getElections, getTypeCounts } from "@/lib/data/elections";
import { pickEnumValue } from "@/lib/data/enum-guards";
import { ElectionType } from "@/generated/prisma";
import { resolveElectionStatus } from "@/lib/elections/status";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";

export const revalidate = 300; // ISR: revalidate every 5 minutes

export const metadata: Metadata = {
  title: "Calendrier électoral",
  description:
    "Calendrier des prochaines élections en France : présidentielle, législatives, municipales, européennes. Compte à rebours, dates et informations clés.",
  alternates: { canonical: "/elections" },
};

interface PageProps {
  searchParams: Promise<{
    type?: string;
  }>;
}

export default async function ElectionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  // A ?type= that is not an ElectionType is dropped, not forwarded: Prisma
  // rejects an out-of-enum value with a validation error, which surfaces as an
  // unhandled 500. An unknown filter means "no filter", so the calendar still
  // renders for a stale bookmark or a scanner payload alike.
  const typeFilter = pickEnumValue(params.type, ElectionType);

  const [rawElections, typeCounts] = await Promise.all([getElections(typeFilter), getTypeCounts()]);

  // The stored status never advances on its own, so resolve it here rather than
  // inside getElections(), which is cached for a day and would freeze `now`.
  const now = new Date();
  const elections = rawElections.map((e) => ({ ...e, status: resolveElectionStatus(e, now) }));

  // Find next upcoming election
  const nextElection = elections.find(
    (e) => e.round1Date && e.round1Date > now && e.status !== "COMPLETED"
  );

  // Build filter URL helper
  const buildUrl = (newParams: Record<string, string | undefined>) => {
    const current = new URLSearchParams();
    if (typeFilter) current.set("type", typeFilter);

    for (const [key, value] of Object.entries(newParams)) {
      if (value) {
        current.set(key, value);
      } else {
        current.delete(key);
      }
    }

    const qs = current.toString();
    return `/elections${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <CollectionPageJsonLd
        name="Calendrier électoral"
        description="Calendrier des prochaines élections en France : présidentielle, législatives, municipales, européennes. Compte à rebours, dates et informations clés."
        url="https://poligraph.fr/elections"
        numberOfItems={elections.length}
      />
      <div className="container mx-auto px-4 pt-4 pb-8">
        <Breadcrumb items={[{ label: "Élections" }]} />
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-display font-extrabold tracking-tight mb-2">
            Calendrier électoral
          </h1>
          <p className="text-muted-foreground">
            Retrouvez les dates des prochaines élections en France, avec compte à rebours et
            informations sur chaque scrutin.
          </p>
        </div>

        {/* Countdown */}
        {nextElection && nextElection.round1Date && (
          <ElectionCountdown
            targetDate={nextElection.round1Date.toISOString()}
            electionTitle={nextElection.title}
            electionIcon={ELECTION_TYPE_ICONS[nextElection.type]}
            dateConfirmed={nextElection.dateConfirmed}
          />
        )}

        {/* Type filters */}
        {typeCounts.length > 0 && (
          <div className="mb-6">
            <p className="text-sm font-medium mb-2">Filtrer par type</p>
            <div className="flex flex-wrap gap-2">
              <Link href={buildUrl({ type: undefined })}>
                <Badge variant={!typeFilter ? "default" : "outline"} className="cursor-pointer">
                  Toutes ({elections.length})
                </Badge>
              </Link>
              {typeCounts.map((t) => {
                const isActive = typeFilter === t.type;
                const icon = ELECTION_TYPE_ICONS[t.type];
                const label = ELECTION_TYPE_LABELS[t.type];

                return (
                  <Link
                    key={t.type}
                    href={buildUrl({
                      type: isActive ? undefined : t.type,
                    })}
                  >
                    <Badge variant={isActive ? "default" : "outline"} className="cursor-pointer">
                      {icon} {label} ({t._count})
                    </Badge>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Active filter dismissible */}
        {typeFilter && (
          <div className="flex flex-wrap gap-2 mb-6">
            <Badge variant="secondary" className="gap-1">
              {ELECTION_TYPE_ICONS[typeFilter]} {ELECTION_TYPE_LABELS[typeFilter]}
              <Link href={buildUrl({ type: undefined })} className="ml-1 hover:text-destructive">
                ×
              </Link>
            </Badge>
            <Link
              href="/elections"
              scroll={false}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Effacer tout
            </Link>
          </div>
        )}

        {/* Timeline */}
        {elections.length > 0 ? (
          <ElectionTimeline elections={elections} />
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p>Aucune élection trouvée</p>
            {typeFilter && (
              <Link
                href="/elections"
                scroll={false}
                className="text-primary hover:underline mt-2 inline-block"
              >
                Effacer les filtres
              </Link>
            )}
          </div>
        )}

        {/* Info card about provisional dates */}
        <Card className="mt-8 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <CardContent>
            <h2 className="font-semibold mb-1">À propos des dates électorales</h2>
            <p className="text-sm text-muted-foreground">
              Les dates des élections sont fixées par décret du Président de la République ou du
              Premier ministre. Les dates affichées comme &quot;provisoires&quot; sont des
              estimations basées sur les échéances légales. Elles seront mises à jour dès
              publication du décret officiel.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
