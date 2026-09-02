import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { getGroupeDetail, getGroupKeyVotes } from "@/lib/data/groupes";
import { VoteCard } from "@/components/votes";
import { CHAMBER_SHORT_LABELS } from "@/config/labels";
import { GLOSSARY } from "@/config/glossary";
import { GOVERNMENT_GROUP_CODE, SENATE_GOVERNMENT_GROUP_CODE } from "@/config/scrutin-importance";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Users, TrendingUp, Target, Activity, FileCheck2 } from "lucide-react";
import { ParliamentaryGroupJsonLd } from "@/components/seo/JsonLd";
import { buildGroupeSeo } from "@/lib/seo/groupe-metadata";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";

export const revalidate = 3600;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const group = await getGroupeDetail(slug);
  if (!group) return missingEntityMetadata("Groupe non trouvé");

  const seo = buildGroupeSeo({
    name: group.name,
    code: group.code,
    chamber: group.chamber,
    seatCount: group.seatCount,
    hasStats: group.stats.length > 0,
  });

  return {
    title: seo.title,
    description: seo.description,
    alternates: { canonical: `/parlement/groupes/${slug}` },
  };
}

export default async function GroupeDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const group = await getGroupeDetail(slug);

  if (!group) notFound();

  const groupKeyVotes = await getGroupKeyVotes(group.id);
  const stats = group.stats[0];

  const chamberLabel = group.chamber === "AN" ? "Assemblée nationale" : "Sénat";
  // Same string as the meta description: the JSON-LD must not describe the group
  // differently from the page (and must not promise a stat the page cannot show).
  const seo = buildGroupeSeo({
    name: group.name,
    code: group.code,
    chamber: group.chamber,
    seatCount: group.seatCount,
    hasStats: group.stats.length > 0,
  });
  const referenceGroupCode =
    group.chamber === "AN" ? GOVERNMENT_GROUP_CODE : SENATE_GOVERNMENT_GROUP_CODE;
  const concordanceVotesTooltip = `${GLOSSARY.concordanceVotesGroupes} Groupe de référence pour cette chambre : ${referenceGroupCode}.`;
  const concordanceTextesTooltip = `${GLOSSARY.concordanceTextesLoi} Groupe de référence pour cette chambre : ${referenceGroupCode}.`;

  return (
    <div className="container mx-auto px-4 py-8">
      <ParliamentaryGroupJsonLd
        name={group.name}
        alternateName={group.shortName ?? undefined}
        description={seo.description}
        url={`https://poligraph.fr/parlement/groupes/${slug}`}
        memberOf={{ name: chamberLabel, url: "https://poligraph.fr/parlement" }}
      />
      <Breadcrumb
        items={[
          { label: "Parlement", href: "/parlement" },
          { label: "Groupes", href: "/parlement/groupes" },
          { label: group.name },
        ]}
      />

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          {group.color && (
            <span
              className="w-5 h-5 rounded-full"
              style={{ backgroundColor: group.color }}
              aria-hidden="true"
            />
          )}
          <h1 className="text-2xl font-display font-extrabold tracking-tight">{group.name}</h1>
          <Badge
            variant="outline"
            className={
              group.chamber === "AN" ? "bg-blue-100 text-blue-700" : "bg-rose-100 text-rose-700"
            }
          >
            {CHAMBER_SHORT_LABELS[group.chamber]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground flex items-center gap-1">
          <Users className="h-4 w-4" />
          {group.seatCount} membre{group.seatCount > 1 ? "s" : ""}
        </p>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-4 text-center">
              <TrendingUp
                className="h-5 w-5 mx-auto mb-1 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-2xl font-bold">{Math.round(stats.cohesionPct)}%</p>
              <p className="text-xs text-muted-foreground">Cohésion</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Target className="h-5 w-5 mx-auto mb-1 text-muted-foreground" aria-hidden="true" />
              <p className="text-2xl font-bold">{Math.round(stats.governmentAlignmentPct)}%</p>
              <div className="flex items-center justify-center gap-1">
                <p className="text-xs text-muted-foreground">Concordance des votes</p>
                <InfoTooltip text={concordanceVotesTooltip} side="bottom" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <FileCheck2
                className="h-5 w-5 mx-auto mb-1 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-2xl font-bold">{Math.round(stats.finalVoteAlignmentPct)}%</p>
              <div className="flex items-center justify-center gap-1">
                <p className="text-xs text-muted-foreground">Concordance sur les textes de loi</p>
                <InfoTooltip text={concordanceTextesTooltip} side="bottom" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Activity className="h-5 w-5 mx-auto mb-1 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-semibold text-muted-foreground">Indisponible</p>
              <p className="text-xs text-muted-foreground">Participation</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Key Votes */}
      {groupKeyVotes.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Votes marquants</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {groupKeyVotes.map((gp) => (
              <VoteCard
                key={gp.scrutin.id}
                id={gp.scrutin.id}
                externalId={gp.scrutin.externalId}
                slug={gp.scrutin.slug}
                title={gp.scrutin.title}
                votingDate={gp.scrutin.votingDate}
                legislature={gp.scrutin.legislature}
                chamber={gp.scrutin.chamber}
                votesFor={gp.scrutin.votesFor}
                votesAgainst={gp.scrutin.votesAgainst}
                votesAbstain={gp.scrutin.votesAbstain}
                result={gp.scrutin.result}
                sourceUrl={gp.scrutin.sourceUrl}
                theme={gp.scrutin.theme}
                policy={gp.scrutin.policyTitle}
              />
            ))}
          </div>
        </section>
      )}

      {/* Members */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Membres</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {group.members
            .sort((a, b) => a.lastName.localeCompare(b.lastName, "fr"))
            .map((m) => (
              <Link
                key={m.id}
                href={`/politiques/${m.slug}`}
                prefetch={false}
                className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted transition-colors"
              >
                <PoliticianAvatar
                  photoUrl={m.photoUrl}
                  firstName={m.firstName}
                  lastName={m.lastName}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{m.fullName}</p>
                  {m.currentParty && (
                    <p className="text-xs text-muted-foreground">{m.currentParty.shortName}</p>
                  )}
                </div>
              </Link>
            ))}
        </div>
      </section>

      {/* Back link */}
      <div className="mt-8 text-center">
        <Link href="/parlement/groupes" className="text-primary hover:underline">
          Tous les groupes
        </Link>
      </div>
    </div>
  );
}
