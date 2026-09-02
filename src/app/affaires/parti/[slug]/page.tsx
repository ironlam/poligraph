import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { ensureContrast } from "@/lib/contrast";
import { SITE_URL } from "@/config/site";
import { getJudicialMaturity } from "@/config/judicial-maturity";
import { PartyAffairsList } from "@/components/affairs/PartyAffairsList";
import type { AffairStatus, Involvement } from "@/types";

export const revalidate = 300;

interface PageProps {
  params: Promise<{ slug: string }>;
}

const MIS_EN_CAUSE: Involvement[] = ["DIRECT", "INDIRECT"];
const VICTIMS: Involvement[] = ["VICTIM", "PLAINTIFF"];

async function getPartyAffairsData(slug: string) {
  "use cache";
  cacheTag("affairs", "parties");
  cacheLife("synced");

  const party = await db.party.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      shortName: true,
      slug: true,
      color: true,
      logoUrl: true,
      affairsAtTime: {
        where: { publicationStatus: "PUBLISHED" },
        include: {
          politician: {
            select: {
              id: true,
              fullName: true,
              slug: true,
              photoUrl: true,
            },
          },
        },
        orderBy: [
          { verdictDate: { sort: "desc", nulls: "last" } },
          { startDate: { sort: "desc", nulls: "last" } },
          { createdAt: "desc" },
        ],
      },
    },
  });

  if (!party) return null;

  const affairs = party.affairsAtTime.map((a) => ({
    ...a,
    fineAmount: a.fineAmount ? Number(a.fineAmount) : null,
  }));

  // Split by involvement role
  const misEnCauseAffairs = affairs.filter((a) =>
    MIS_EN_CAUSE.includes(a.involvement as Involvement)
  );
  const victimAffairs = affairs.filter((a) => VICTIMS.includes(a.involvement as Involvement));

  // KPIs: maturity-based, unique by politician per tier
  const condamnesPol = new Set<string>();
  const proceduresPol = new Set<string>();
  const enquetesPol = new Set<string>();
  let closCount = 0;

  for (const a of misEnCauseAffairs) {
    const maturity = getJudicialMaturity(a.status as AffairStatus);
    if (maturity === "CONDAMNATION") {
      condamnesPol.add(a.politician.id);
    } else if (maturity === "PROCEDURE_VALIDEE") {
      proceduresPol.add(a.politician.id);
    } else if (maturity === "ENQUETE") {
      enquetesPol.add(a.politician.id);
    } else {
      closCount++;
    }
  }
  // Deduplicate: a politician in a higher tier is not counted in lower tiers
  for (const id of condamnesPol) {
    proceduresPol.delete(id);
    enquetesPol.delete(id);
  }
  for (const id of proceduresPol) {
    enquetesPol.delete(id);
  }

  const condamnesCount = condamnesPol.size;
  const proceduresCount = proceduresPol.size;
  const enquetesCount = enquetesPol.size;

  // Deduplicated politician lists
  type PolEntry = {
    id: string;
    fullName: string;
    slug: string;
    photoUrl: string | null;
    count: number;
  };

  function deduplicatePoliticians(list: typeof affairs): PolEntry[] {
    const map = new Map<string, PolEntry>();
    for (const a of list) {
      const p = a.politician;
      const existing = map.get(p.id);
      if (existing) {
        existing.count++;
      } else {
        map.set(p.id, { ...p, count: 1 });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }

  // Split mis-en-cause affairs by maturity tier
  const condamnationAffairs = misEnCauseAffairs.filter(
    (a) => getJudicialMaturity(a.status as AffairStatus) === "CONDAMNATION"
  );
  const procedureAffairs = misEnCauseAffairs.filter(
    (a) => getJudicialMaturity(a.status as AffairStatus) === "PROCEDURE_VALIDEE"
  );
  const enqueteAffairs = misEnCauseAffairs.filter(
    (a) => getJudicialMaturity(a.status as AffairStatus) === "ENQUETE"
  );
  const closedAffairs = misEnCauseAffairs.filter(
    (a) => getJudicialMaturity(a.status as AffairStatus) === "CLOSE_SANS_CONDAMNATION"
  );

  // Deduplicated politician lists per tier
  const condamnationPoliticians = deduplicatePoliticians(condamnationAffairs);
  const condamnationIds = new Set(condamnationPoliticians.map((p) => p.id));

  // Procedures: exclude politicians already in condamnation tier
  const procedurePoliticians = deduplicatePoliticians(procedureAffairs).filter(
    (p) => !condamnationIds.has(p.id)
  );
  const procedureIds = new Set(procedurePoliticians.map((p) => p.id));

  // Enquetes: exclude politicians in higher tiers
  const enquetePoliticians = deduplicatePoliticians(enqueteAffairs).filter(
    (p) => !condamnationIds.has(p.id) && !procedureIds.has(p.id)
  );
  const activeIds = new Set([
    ...condamnationIds,
    ...procedureIds,
    ...enquetePoliticians.map((p) => p.id),
  ]);

  // Closed-only: politicians whose ALL affairs are closed
  const closedOnlyPoliticians = deduplicatePoliticians(closedAffairs).filter(
    (p) => !activeIds.has(p.id)
  );
  const victimPoliticians = deduplicatePoliticians(victimAffairs);

  return {
    party: {
      id: party.id,
      name: party.name,
      shortName: party.shortName,
      slug: party.slug,
      color: party.color,
      logoUrl: party.logoUrl,
    },
    affairs,
    misEnCauseAffairs,
    victimAffairs,
    condamnesCount,
    proceduresCount,
    enquetesCount,
    closCount,
    condamnationPoliticians,
    procedurePoliticians,
    enquetePoliticians,
    closedOnlyPoliticians,
    victimPoliticians,
  };
}

export async function generateStaticParams() {
  const parties = await db.party.findMany({
    where: {
      slug: { not: null },
      affairsAtTime: { some: { publicationStatus: "PUBLISHED" } },
    },
    select: { slug: true },
  });
  return parties.filter((p) => p.slug).map((p) => ({ slug: p.slug as string }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPartyAffairsData(slug);

  if (!data) return missingEntityMetadata("Parti non trouvé");

  const { party, condamnesCount, proceduresCount, victimPoliticians, misEnCauseAffairs } = data;
  const totalMisEnCause = new Set(misEnCauseAffairs.map((a) => a.politician.id)).size;

  const parts: string[] = [];
  if (condamnesCount > 0)
    parts.push(
      `${condamnesCount} élu${condamnesCount > 1 ? "s" : ""} condamné${condamnesCount > 1 ? "s" : ""}`
    );
  if (proceduresCount > 0) parts.push(`${proceduresCount} en procédure validée par un juge`);
  if (victimPoliticians.length > 0)
    parts.push(`${victimPoliticians.length} victime${victimPoliticians.length > 1 ? "s" : ""}`);

  const description = `${totalMisEnCause} élu${totalMisEnCause > 1 ? "s" : ""} ${party.name} concerné${totalMisEnCause > 1 ? "s" : ""} par des affaires judiciaires${parts.length > 0 ? `. ${parts.join(", ")}.` : "."} Sources vérifiées.`;

  return {
    title: `Affaires judiciaires — ${party.name} (${party.shortName})`,
    description,
    openGraph: {
      title: `Affaires judiciaires — ${party.name} (${party.shortName}) | Poligraph`,
      description,
      type: "website",
    },
    alternates: { canonical: `/affaires/parti/${slug}` },
  };
}

export default async function PartyAffairsPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await getPartyAffairsData(slug);

  if (!data) notFound();

  const {
    party,
    affairs,
    misEnCauseAffairs,
    victimAffairs,
    condamnesCount,
    proceduresCount,
    enquetesCount,
    closCount,
    condamnationPoliticians,
    procedurePoliticians,
    enquetePoliticians,
    closedOnlyPoliticians,
    victimPoliticians,
  } = data;

  // Build factual summary (maturity-based)
  const summaryParts: string[] = [];
  const totalMisEnCause = new Set(misEnCauseAffairs.map((a) => a.politician.id)).size;
  if (totalMisEnCause > 0) {
    summaryParts.push(
      `${totalMisEnCause} élu${totalMisEnCause > 1 ? "s" : ""} ${party.name} concerné${totalMisEnCause > 1 ? "s" : ""} par des affaires judiciaires.`
    );
    const statusParts: string[] = [];
    if (condamnesCount > 0)
      statusParts.push(`${condamnesCount} condamné${condamnesCount > 1 ? "s" : ""}`);
    if (proceduresCount > 0)
      statusParts.push(`${proceduresCount} en procédure validée par un juge`);
    if (statusParts.length > 0) summaryParts.push(statusParts.join(", ") + ".");
  }
  if (closCount > 0) {
    summaryParts.push(
      `${closCount} procédure${closCount > 1 ? "s" : ""} close${closCount > 1 ? "s" : ""} sans condamnation.`
    );
  }
  if (victimAffairs.length > 0) {
    summaryParts.push(
      `${victimPoliticians.length} élu${victimPoliticians.length > 1 ? "s" : ""} du parti ${victimAffairs.length > 1 ? "sont" : "est"} victime${victimPoliticians.length > 1 ? "s" : ""} ou plaignant${victimPoliticians.length > 1 ? "s" : ""} dans ${victimAffairs.length} affaire${victimAffairs.length > 1 ? "s" : ""}.`
    );
  }

  return (
    <>
      <CollectionPageJsonLd
        name={`Affaires judiciaires — ${party.name}`}
        description={summaryParts.join(" ")}
        url={`${SITE_URL}/affaires/parti/${party.slug}`}
        numberOfItems={affairs.length}
        about={{
          name: party.name,
          url: `${SITE_URL}/partis/${party.slug}`,
        }}
      />

      <div className="container mx-auto px-4 pt-4 pb-8">
        <Breadcrumb
          items={[
            { label: "Affaires", href: "/affaires" },
            { label: party.shortName || party.name },
          ]}
        />

        {/* Party header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            {party.logoUrl ? (
              <Image
                src={party.logoUrl}
                alt={party.name}
                width={64}
                height={64}
                className="w-16 h-16 object-contain"
              />
            ) : (
              <div
                className="w-16 h-16 rounded-lg flex items-center justify-center text-2xl font-bold text-white"
                style={{ backgroundColor: party.color || "#888" }}
              >
                {party.shortName.substring(0, 2)}
              </div>
            )}
            <div>
              <h1 className="text-3xl font-display font-extrabold tracking-tight">
                Affaires judiciaires - {party.name}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  style={{
                    backgroundColor: party.color ? `${party.color}20` : undefined,
                    color: party.color ? ensureContrast(party.color, "#ffffff") : undefined,
                  }}
                >
                  {party.shortName}
                </Badge>
                <Link
                  href={`/partis/${party.slug}`}
                  className="text-sm text-primary hover:underline"
                >
                  Voir la fiche du parti →
                </Link>
              </div>
            </div>
          </div>

          <p className="text-muted-foreground">{summaryParts.join(" ")}</p>
        </div>

        {/* KPI cards: maturity-based counters */}
        {misEnCauseAffairs.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="pt-6 text-center">
                  <div className="text-3xl font-bold tabular-nums text-red-600">
                    {condamnesCount}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Condamnation{condamnesCount > 1 ? "s" : ""}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <div className="text-3xl font-bold tabular-nums text-amber-600">
                    {proceduresCount}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Procédure{proceduresCount > 1 ? "s" : ""} validée
                    {proceduresCount > 1 ? "s" : ""}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <div className="text-3xl font-bold tabular-nums text-gray-400">
                    {enquetesCount}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Enquête{enquetesCount > 1 ? "s" : ""}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <div className="text-3xl font-bold tabular-nums text-green-600">{closCount}</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Close{closCount > 1 ? "s" : ""} sans condamnation
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tier 1: Condamnations */}
            {condamnationPoliticians.length > 0 && (
              <Card className="mb-6 border-l-4 border-l-red-500">
                <CardHeader>
                  <CardTitle className="text-red-700 dark:text-red-400">
                    Élus condamnés ({condamnationPoliticians.length})
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Condamnation définitive ou en première instance
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {condamnationPoliticians.map((pol) => (
                      <Link
                        key={pol.id}
                        href={`/politiques/${pol.slug}`}
                        className="flex items-center gap-3 p-3 rounded-lg border border-red-200 dark:border-red-800 hover:bg-red-50/50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <PoliticianAvatar
                          photoUrl={pol.photoUrl}
                          fullName={pol.fullName}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{pol.fullName}</p>
                          <p className="text-xs text-red-600 dark:text-red-400">
                            {pol.count} condamnation{pol.count > 1 ? "s" : ""}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tier 2: Procedures validees */}
            {procedurePoliticians.length > 0 && (
              <Card className="mb-6 border-l-4 border-l-amber-500">
                <CardHeader>
                  <CardTitle className="text-amber-700 dark:text-amber-400">
                    Procédures en cours ({procedurePoliticians.length})
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Mise en examen, instruction ou renvoi devant un tribunal. La présomption d{"'"}
                    innocence s{"'"}applique.
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {procedurePoliticians.map((pol) => (
                      <Link
                        key={pol.id}
                        href={`/politiques/${pol.slug}`}
                        className="flex items-center gap-3 p-3 rounded-lg border border-amber-200 dark:border-amber-800 hover:bg-amber-50/50 dark:hover:bg-amber-900/20 transition-colors"
                      >
                        <PoliticianAvatar
                          photoUrl={pol.photoUrl}
                          fullName={pol.fullName}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{pol.fullName}</p>
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            {pol.count} procédure{pol.count > 1 ? "s" : ""}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tier 3: Enquetes */}
            {enquetePoliticians.length > 0 && (
              <Card className="mb-6 border-l-4 border-l-gray-300 dark:border-l-gray-600">
                <CardHeader>
                  <CardTitle className="text-muted-foreground">
                    Enquêtes préliminaires ({enquetePoliticians.length})
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Stade de l{"'"}enquête, aucun juge n{"'"}a validé la poursuite. La présomption d
                    {"'"}innocence s{"'"}applique.
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {enquetePoliticians.map((pol) => (
                      <Link
                        key={pol.id}
                        href={`/politiques/${pol.slug}`}
                        className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                      >
                        <PoliticianAvatar
                          photoUrl={pol.photoUrl}
                          fullName={pol.fullName}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{pol.fullName}</p>
                          <p className="text-xs text-muted-foreground">
                            {pol.count} enquête{pol.count > 1 ? "s" : ""}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tier 4: Closed without condemnation */}
            {closedOnlyPoliticians.length > 0 && (
              <Card className="mb-6 border-l-4 border-l-green-500">
                <CardHeader>
                  <CardTitle className="text-green-700 dark:text-green-400">
                    Procédures closes sans condamnation ({closedOnlyPoliticians.length})
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Élus dont toutes les affaires ont été classées, acquittées ou prescrites
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {closedOnlyPoliticians.map((pol) => (
                      <Link
                        key={pol.id}
                        href={`/politiques/${pol.slug}`}
                        className="flex items-center gap-3 p-3 rounded-lg border border-green-200 dark:border-green-800 hover:bg-green-50/50 dark:hover:bg-green-900/20 transition-colors"
                      >
                        <PoliticianAvatar
                          photoUrl={pol.photoUrl}
                          fullName={pol.fullName}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{pol.fullName}</p>
                          <p className="text-xs text-green-600 dark:text-green-400">
                            {pol.count} affaire{pol.count > 1 ? "s" : ""} close
                            {pol.count > 1 ? "s" : ""}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Victim politicians section */}
        {victimPoliticians.length > 0 && (
          <>
            <h2 className="text-xl font-semibold mb-4">
              Élus victimes ou plaignants ({victimPoliticians.length})
            </h2>
            <Card className="mb-8">
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {victimPoliticians.map((pol) => (
                    <Link
                      key={pol.id}
                      href={`/politiques/${pol.slug}`}
                      className="flex items-center gap-3 p-3 rounded-lg border border-blue-200 dark:border-blue-800 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-colors"
                    >
                      <PoliticianAvatar photoUrl={pol.photoUrl} fullName={pol.fullName} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{pol.fullName}</p>
                        <p className="text-xs text-primary">
                          Victime dans {pol.count} affaire{pol.count > 1 ? "s" : ""}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Affairs list with client-side filters */}
        <PartyAffairsList affairs={affairs} />

        {/* Methodology note */}
        <div className="mt-6 p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground">
          <p className="font-medium mb-1">Méthodologie</p>
          <p>
            Les compteurs distinguent quatre niveaux de maturité judiciaire : les{" "}
            <strong>condamnations</strong> (définitives ou en première instance), les{" "}
            <strong>procédures validées</strong> par un juge (mise en examen, instruction, renvoi),
            les <strong>enquêtes préliminaires</strong> (aucun juge n{"'"}a encore validé la
            poursuite), et les <strong>procédures closes sans condamnation</strong> (relaxe,
            acquittement, non-lieu, prescription, classement). Les compteurs par élu sont
            dédupliqués : un élu condamné n{"'"}est pas recompté dans les procédures en cours.{" "}
            <Link
              href="/methodologie#comment-nous-comptons"
              className="text-primary hover:underline"
            >
              En savoir plus
            </Link>
          </p>
        </div>

        {/* Back links */}
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href={`/partis/${party.slug}`} className="text-sm text-primary hover:underline">
            ← Fiche du parti {party.shortName}
          </Link>
          <Link href="/affaires" className="text-sm text-primary hover:underline">
            ← Toutes les affaires
          </Link>
        </div>
      </div>
    </>
  );
}
