import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import {
  getGroupeDetail,
  getGroupHemicyclePlacement,
  getGroupKeyVotes,
  getGroupPresidents,
} from "@/lib/data/groupes";
import { VoteCard } from "@/components/votes";
import { CHAMBER_LABELS, groupPresidencyLabel } from "@/config/labels";
import { formatDate, normalizeImageUrl } from "@/lib/utils";
import { GLOSSARY } from "@/config/glossary";
import { GOVERNMENT_GROUP_CODE, SENATE_GOVERNMENT_GROUP_CODE } from "@/config/scrutin-importance";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { TrendingUp, Target, Activity, FileCheck2 } from "lucide-react";
import { ParliamentaryGroupJsonLd } from "@/components/seo/JsonLd";
import { buildGroupeSeo } from "@/lib/seo/groupe-metadata";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";
import { getGovernmentProjectPositionsForGroup } from "@/lib/data/government-project-positions";
import { GovernmentProjectPositionBreakdown } from "@/components/groupes/GovernmentProjectPositionBreakdown";
import { GroupMonogram, formatSeatShare } from "@/components/groupes/GroupCard";
import { ROUTES } from "@/config/routes";
import { GroupShareSheet } from "@/components/share/GroupShareSheet";
import { legislatureLabel } from "@/lib/share-card";
import { SITE_URL } from "@/config/site";

export const revalidate = 3600;

// Empty on purpose: the group slugs live in the database,
// so nothing is prerendered at build time. The mere
// presence of generateStaticParams is what makes the route ISR-cacheable instead
// of fully dynamic, so the `revalidate` above finally applies. Each URL is
// rendered on first request, then served from cache until the next revalidation.
// Same pattern and same reasoning as /parlement/votes/[slug].
//
// Only safe while this route does NOT read `searchParams`: that would keep it
// dynamic whatever it declares, and combining the two with the "use cache" data
// functions triggers DYNAMIC_SERVER_USAGE.
export async function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

function seatNoun(chamber: "AN" | "SENAT", seats: number): string {
  const noun = chamber === "AN" ? "député" : "sénateur";
  if (seats > 1) return `${noun}s`;
  return noun;
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

  const isNonInscritAN = group.chamber === "AN" && group.code === "NI";
  const [groupKeyVotes, hemicyclePlacement, presidents, governmentProjects] = await Promise.all([
    getGroupKeyVotes(group.id),
    getGroupHemicyclePlacement(group.id, group.chamber),
    getGroupPresidents(group.id),
    group.chamber === "AN" && !isNonInscritAN
      ? getGovernmentProjectPositionsForGroup(group.code)
      : null,
  ]);
  const stats = group.stats[0];

  const chamberLabel = CHAMBER_LABELS[group.chamber];
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

  // What the share card prints. A group belongs to a legislature at the Assemblée (its slug carries
  // it); the Sénat is renewed by halves and has none, so nothing is invented for it.
  const cardSubline = [
    group.code,
    chamberLabel,
    group.legislature !== null ? legislatureLabel(group.legislature) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  // The card has room for one portrait. A shared presidency stays on the page, which lists
  // everyone: picking one of them for the image would be an editorial choice.
  const cardPresident = presidents.length === 1 ? presidents[0]! : null;
  // The reference group agrees with itself on every vote: printing its 100 % would say nothing.
  const isReferenceGroup = group.code === referenceGroupCode;
  const cardIndicators = stats
    ? [
        { value: Math.round(stats.cohesionPct), suffix: " %", label: "de cohésion interne" },
        ...(isReferenceGroup
          ? []
          : [
              {
                value: Math.round(stats.governmentAlignmentPct),
                suffix: " %",
                label: `de votes identiques au groupe ${referenceGroupCode}`,
              },
              {
                value: Math.round(stats.finalVoteAlignmentPct),
                suffix: " %",
                label: `de votes finaux identiques au groupe ${referenceGroupCode}`,
              },
            ]),
      ]
    : [];
  const cardScope = stats
    ? `Scrutins ${group.chamber === "AN" ? `de la ${legislatureLabel(stats.legislature)}` : "du Sénat"}. Le groupe ${referenceGroupCode} sert d'indicateur de la position gouvernementale. Source : ${chamberLabel}.`
    : `Source : ${chamberLabel}. Les données présentées peuvent être incomplètes.`;

  // Members by the first letter of their last name, accents folded ("Élisabeth Borne" files
  // under B, "Éric Bothorel" too). The party is printed once when every member shares it.
  const sortedMembers = [...group.members].sort((a, b) =>
    a.lastName.localeCompare(b.lastName, "fr")
  );
  const memberLetters: { letter: string; members: typeof sortedMembers }[] = [];
  for (const member of sortedMembers) {
    const letter = member.lastName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .charAt(0)
      .toUpperCase();
    const last = memberLetters[memberLetters.length - 1];
    if (last && last.letter === letter) last.members.push(member);
    else memberLetters.push({ letter, members: [member] });
  }
  const firstParty = sortedMembers[0]?.currentParty?.shortName ?? null;
  const sharedParty =
    firstParty && sortedMembers.every((m) => m.currentParty?.shortName === firstParty)
      ? firstParty
      : null;

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
      <div className="mb-8 overflow-hidden rounded-2xl border bg-card">
        <div
          aria-hidden="true"
          className="h-2"
          style={{ backgroundColor: group.color ?? "#a6a6a6" }}
        />
        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-start gap-6">
            <div className="flex min-w-0 grow basis-[30rem] items-start gap-4">
              <GroupMonogram
                code={group.code}
                color={group.color}
                className="h-14 min-w-14 rounded-xl px-2 text-base sm:h-16 sm:min-w-16 sm:text-lg"
              />
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">
                  Groupe parlementaire · {chamberLabel}
                  {group.legislature !== null ? ` · ${legislatureLabel(group.legislature)}` : ""}
                </p>
                <h1 className="mt-1 text-2xl font-display font-extrabold leading-tight tracking-tight sm:text-4xl">
                  {group.name}
                </h1>
                <p className="mt-2 text-base">
                  <strong>
                    {group.seatCount} {seatNoun(group.chamber, group.seatCount)}
                  </strong>
                  {hemicyclePlacement && hemicyclePlacement.total > 0
                    ? `, soit ${formatSeatShare(hemicyclePlacement.seats, hemicyclePlacement.total)} des ${hemicyclePlacement.total} sièges occupés.`
                    : "."}
                </p>
              </div>
            </div>

            <div className="flex grow basis-72 flex-col gap-3">
              {presidents.length > 0 && (
                <div>
                  <ul className="flex flex-col gap-2">
                    {presidents.map((president) => (
                      <li key={president.politician.slug}>
                        <Link
                          href={`/politiques/${president.politician.slug}`}
                          prefetch={false}
                          className="flex min-h-11 items-center gap-3 rounded-lg border p-2 pr-4 hover:bg-muted transition-colors"
                        >
                          <PoliticianAvatar
                            photoUrl={president.politician.photoUrl}
                            blobPhotoUrl={president.politician.blobPhotoUrl}
                            firstName={president.politician.firstName}
                            lastName={president.politician.lastName}
                            size="sm"
                          />
                          <span className="flex flex-col">
                            <span className="text-xs text-muted-foreground">
                              {groupPresidencyLabel(president.politician.civility)} depuis le{" "}
                              {formatDate(president.since)}
                            </span>
                            <span className="text-sm font-semibold">
                              {president.politician.fullName}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Source :{" "}
                    <a
                      href={presidents[0]!.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-foreground"
                      aria-label={`Données ouvertes, ${chamberLabel} (fichier officiel, nouvel onglet)`}
                    >
                      données ouvertes, {chamberLabel}
                    </a>
                  </p>
                </div>
              )}
              <GroupShareSheet
                slug={slug}
                data={{
                  title: group.name,
                  text: `${group.name} (${cardSubline}) : membres et votes sur Poligraph`,
                  url: `${SITE_URL}/parlement/groupes/${slug}`,
                }}
                name={group.name}
                subline={cardSubline}
                color={group.color}
                president={
                  cardPresident && {
                    fullName: cardPresident.politician.fullName,
                    role: `${groupPresidencyLabel(cardPresident.politician.civility)} depuis ${cardPresident.since.getUTCFullYear()}`,
                    photoUrl: normalizeImageUrl(
                      cardPresident.politician.blobPhotoUrl ?? cardPresident.politician.photoUrl
                    ),
                  }
                }
                seatCount={group.seatCount}
                hemicycle={
                  hemicyclePlacement && {
                    placement: hemicyclePlacement,
                    seatNoun: seatNoun(group.chamber, hemicyclePlacement.seats),
                  }
                }
                indicators={cardIndicators}
                scope={cardScope}
              />
            </div>
          </div>

          {hemicyclePlacement && hemicyclePlacement.total > 0 && (
            <div className="mt-6">
              <div
                role="img"
                aria-label={`Place du groupe dans l'hémicycle : ${hemicyclePlacement.seats} sièges sur ${hemicyclePlacement.total}, de la gauche vers la droite`}
                className="flex h-3.5 gap-0.5 overflow-hidden rounded-md"
              >
                {hemicyclePlacement.before > 0 && (
                  <span className="bg-muted" style={{ flex: `${hemicyclePlacement.before} 1 0` }} />
                )}
                <span
                  style={{
                    flex: `${hemicyclePlacement.seats} 1 0`,
                    backgroundColor: group.color ?? "#a6a6a6",
                  }}
                />
                {hemicyclePlacement.total - hemicyclePlacement.before - hemicyclePlacement.seats >
                  0 && (
                  <span
                    className="bg-muted"
                    style={{
                      flex: `${hemicyclePlacement.total - hemicyclePlacement.before - hemicyclePlacement.seats} 1 0`,
                    }}
                  />
                )}
              </div>
              <p className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>Gauche</span>
                <span>Place dans l&apos;hémicycle</span>
                <span>Droite</span>
              </p>
            </div>
          )}
        </div>
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

      {group.chamber === "AN" && (governmentProjects || isNonInscritAN) && (
        <section
          className="mb-10 rounded-2xl border bg-card p-5 sm:p-7"
          aria-labelledby="government-projects-title"
        >
          {isNonInscritAN ? (
            <>
              <h2 id="government-projects-title" className="font-display text-xl font-bold">
                Positions sur les projets gouvernementaux
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Non calculé pour les non-inscrits, qui ne constituent pas un groupe parlementaire.
              </p>
            </>
          ) : (
            <div className="flex flex-wrap gap-x-10 gap-y-6">
              <div className="min-w-0 grow basis-80">
                <h2
                  id="government-projects-title"
                  className="font-display text-xl font-bold sm:text-2xl"
                >
                  Positions sur les projets gouvernementaux
                </h2>
                <p className="mt-2 text-base text-muted-foreground">
                  Position majoritaire du groupe lors des votes sur l{"'"}ensemble des projets de
                  loi déposés par le gouvernement. L{"'"}abstention reste distincte et n{"'"}est pas
                  comptée comme un soutien.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                  <Link
                    href={ROUTES.groupeGovernmentProjects(slug)}
                    className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    Voir les {governmentProjects!.summary.eligibleScrutinCount} scrutins
                  </Link>
                  <Link
                    href={ROUTES.governmentProjectsMethodology}
                    className="inline-flex min-h-11 items-center text-sm text-primary hover:underline"
                  >
                    Comprendre la méthode
                  </Link>
                </div>
              </div>
              <div className="min-w-0 grow basis-96">
                <GovernmentProjectPositionBreakdown summary={governmentProjects!.summary} />
                <p className="mt-4 text-xs text-muted-foreground">
                  {governmentProjects!.summary.consideredCount} scrutins pris en compte sur{" "}
                  {governmentProjects!.summary.eligibleScrutinCount} dans le périmètre
                  {governmentProjects!.summary.groupExcludedCount > 0
                    ? `, ${governmentProjects!.summary.groupExcludedCount} sans position retenue pour ce groupe`
                    : ""}
                  .
                  {governmentProjects!.summary.updatedAt &&
                    ` Sources récupérées le ${governmentProjects!.summary.updatedAt.toLocaleDateString(
                      "fr-FR",
                      { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }
                    )}.`}
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Key Votes */}
      {groupKeyVotes.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 font-display text-xl font-bold sm:text-2xl">Votes marquants</h2>
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
      <section aria-labelledby="members-title">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="members-title" className="font-display text-xl font-bold sm:text-2xl">
            {group.members.length > 1
              ? `Les ${group.members.length} ${seatNoun(group.chamber, group.members.length)} du groupe`
              : "Membres"}
          </h2>
          {sharedParty && (
            <p className="text-sm text-muted-foreground">Tous rattachés à {sharedParty}</p>
          )}
        </div>
        {memberLetters.length > 1 && (
          <nav aria-label="Aller à une lettre" className="mt-4 flex flex-wrap gap-1">
            {memberLetters.map(({ letter }) => (
              <a
                key={letter}
                href={`#membres-${letter}`}
                className="inline-flex size-11 items-center justify-center rounded-lg border bg-card font-semibold hover:bg-muted"
              >
                {letter}
              </a>
            ))}
          </nav>
        )}
        <div className="mt-4 rounded-2xl border bg-card px-3 pb-3 sm:px-5">
          {memberLetters.map(({ letter, members }) => (
            <div
              key={letter}
              id={`membres-${letter}`}
              className="flex scroll-mt-20 gap-3 border-t pt-3 mt-3 first:mt-0 first:border-t-0 sm:gap-4"
            >
              <span
                aria-hidden="true"
                className="w-6 shrink-0 pt-2.5 font-display text-xl font-extrabold text-primary sm:w-8"
              >
                {letter}
              </span>
              <ul className="grid min-w-0 grow grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-4">
                {members.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/politiques/${m.slug}`}
                      prefetch={false}
                      className="flex min-h-12 items-center gap-2.5 rounded-lg px-2 py-1 hover:bg-muted transition-colors"
                    >
                      <PoliticianAvatar
                        photoUrl={m.photoUrl}
                        blobPhotoUrl={m.blobPhotoUrl}
                        firstName={m.firstName}
                        lastName={m.lastName}
                        size="sm"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm">
                          {m.firstName} <strong className="font-semibold">{m.lastName}</strong>
                        </span>
                        {!sharedParty && m.currentParty && (
                          <span className="block text-xs text-muted-foreground">
                            {m.currentParty.shortName}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
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
