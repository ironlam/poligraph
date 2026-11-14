import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { GroupCard } from "@/components/groupes/GroupCard";
import { getGroupesListing, type GroupListingItem } from "@/lib/data/groupes";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";
import { ROUTES } from "@/config/routes";
import { SENATE_GOVERNMENT_GROUP_CODE } from "@/config/scrutin-importance";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Groupes parlementaires",
  description:
    "Groupes parlementaires de l'Assemblée nationale et du Sénat : composition, cohésion et positions de vote.",
  alternates: { canonical: "/parlement/groupes" },
};

const LEGEND = [
  { label: "Pour", color: "var(--vote-pour)" },
  { label: "Abstention", color: "var(--vote-abstention)" },
  { label: "Contre", color: "var(--vote-contre)" },
];

function SeatStrip({ groups, label }: { groups: GroupListingItem[]; label: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="mt-4 flex h-4 gap-0.5 overflow-hidden rounded-md bg-card"
    >
      {groups.map((g) => (
        <span
          key={g.id}
          title={`${g.code} : ${g.seatCount} sièges`}
          style={{ flex: `${g.seatCount} 1 0`, backgroundColor: g.color ?? "#a6a6a6" }}
        />
      ))}
    </div>
  );
}

function seatTotal(groups: GroupListingItem[]): number {
  return groups.reduce((sum, g) => sum + g.seatCount, 0);
}

export default async function GroupesPage() {
  const groups = await getGroupesListing({ includeGovernmentProjectPositions: true });

  const sorted = [...groups]
    .filter((g) => g.seatCount > 0)
    .sort((a, b) => b.seatCount - a.seatCount);
  const anGroups = sorted.filter((g) => g.chamber === "AN");
  const senatGroups = sorted.filter((g) => g.chamber === "SENAT");
  const anSeats = seatTotal(anGroups);
  const senatSeats = seatTotal(senatGroups);

  return (
    <div className="container mx-auto px-4 py-8">
      <CollectionPageJsonLd
        name="Groupes parlementaires"
        description="Groupes parlementaires de l'Assemblée nationale et du Sénat : composition, cohésion et positions de vote."
        url="https://poligraph.fr/parlement/groupes"
        numberOfItems={sorted.length}
      />
      <Breadcrumb
        items={[{ label: "Parlement", href: "/parlement" }, { label: "Groupes parlementaires" }]}
      />

      <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-3xl font-display font-extrabold tracking-tight sm:text-4xl">
            Groupes parlementaires
          </h1>
          <p className="mt-3 text-base text-muted-foreground sm:text-lg">
            Qui siège avec qui, et comment chaque groupe vote quand le gouvernement présente un
            projet de loi.
          </p>
        </div>
        <nav aria-label="Aller à une chambre" className="flex flex-wrap gap-2">
          {anGroups.length > 0 && (
            <a
              href="#assemblee"
              className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              Assemblée nationale · {anGroups.length}
            </a>
          )}
          {senatGroups.length > 0 && (
            <a
              href="#senat"
              className="inline-flex min-h-11 items-center rounded-full border bg-card px-4 text-sm font-semibold"
            >
              Sénat · {senatGroups.length}
            </a>
          )}
        </nav>
      </div>

      {anGroups.length > 0 && (
        <section id="assemblee" aria-labelledby="assemblee-title" className="mb-14 scroll-mt-20">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="assemblee-title" className="font-display text-2xl font-bold">
              Assemblée nationale
            </h2>
            <p className="text-sm text-muted-foreground">
              {anSeats} députés, du plus grand groupe au plus petit
            </p>
          </div>
          <SeatStrip
            groups={anGroups}
            label={`Répartition des ${anSeats} députés entre les groupes, du plus grand au plus petit`}
          />

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="font-semibold">Sur les projets de loi du gouvernement :</span>
            {LEGEND.map((item) => (
              <span key={item.label} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-3 rounded-sm"
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </span>
            ))}
            <Link
              href={ROUTES.governmentProjectsMethodology}
              className="inline-flex min-h-11 items-center text-primary underline-offset-2 hover:underline"
            >
              Comment c&apos;est calculé
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {anGroups.map((g) => (
              <GroupCard key={g.id} group={g} chamberSeats={anSeats} />
            ))}
          </div>
        </section>
      )}

      {senatGroups.length > 0 && (
        <section id="senat" aria-labelledby="senat-title" className="mb-8 scroll-mt-20">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="senat-title" className="font-display text-2xl font-bold">
              Sénat
            </h2>
            <p className="text-sm text-muted-foreground">
              {senatSeats} sénateurs, du plus grand groupe au plus petit
            </p>
          </div>
          <SeatStrip
            groups={senatGroups}
            label={`Répartition des ${senatSeats} sénateurs entre les groupes, du plus grand au plus petit`}
          />
          <p className="mt-5 max-w-3xl text-sm text-muted-foreground">
            <strong className="text-foreground">Cohésion</strong> : part moyenne des membres qui
            votent comme la majorité de leur groupe.{" "}
            <strong className="text-foreground">Concordance</strong> : part des scrutins où le
            groupe vote comme le groupe {SENATE_GOVERNMENT_GROUP_CODE}, qui sert de repère de la
            position du gouvernement. La participation n&apos;est pas encore calculée pour le Sénat.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {senatGroups.map((g) => (
              <GroupCard key={g.id} group={g} chamberSeats={senatSeats} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
