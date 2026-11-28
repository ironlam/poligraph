import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Badge } from "@/components/ui/badge";
import { CollectionPageJsonLd, ItemListJsonLd } from "@/components/seo/JsonLd";
import { ROUTES } from "@/config/routes";
import { SITE_URL } from "@/config/site";
import { formatDate } from "@/lib/utils";
import {
  getMotionsDeCensure,
  type CensureLegislature,
  type CensureMotion,
} from "@/lib/data/motions-de-censure";
import {
  AN_VOTES_OPEN_DATA_URL,
  CENSURE_ARTICLE_LABELS,
  CONSTITUTION_SOURCE_URL,
} from "@/lib/votes/motions-de-censure";
import {
  allMotions,
  groupDeputiesByCount,
  firstYear,
  legislatureLabel,
  pageDescription,
  pageTitle,
  resultLabel,
  votesForLabel,
} from "./page-text";

export const revalidate = 86400; // ISR: 24h backstop; real changes propagate via the "votes" tag

export async function generateMetadata(): Promise<Metadata> {
  const data = await getMotionsDeCensure();
  return {
    title: pageTitle(data),
    description: pageDescription(data),
    alternates: { canonical: ROUTES.motionsDeCensure },
  };
}

function MotionItem({ motion }: { motion: CensureMotion }) {
  const share =
    motion.requiredMajority != null
      ? Math.min((motion.votesFor / motion.requiredMajority) * 100, 100)
      : null;
  return (
    <li className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-semibold">{formatDate(motion.votingDate)}</p>
        <Badge variant={motion.adopted ? "default" : "outline"}>
          {resultLabel(motion.adopted)}
        </Badge>
      </div>
      <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">Gouvernement</dt>
        <dd>
          {motion.government ? (
            <Link
              prefetch={false}
              href={`/politiques/gouvernements/${motion.government.slug}`}
              // 44 px target without growing the row: the padding is taken back by the margin.
              className="inline-flex min-h-11 -my-3 items-center underline-offset-2 hover:underline"
            >
              {motion.government.name}
            </Link>
          ) : (
            "Non renseigné"
          )}
        </dd>
        <dt className="text-muted-foreground">Procédure</dt>
        <dd>{motion.article ? CENSURE_ARTICLE_LABELS[motion.article] : "Non précisée"}</dd>
        <dt className="text-muted-foreground">Résultat</dt>
        <dd className="tabular-nums">{votesForLabel(motion)}</dd>
      </dl>
      {share != null && (
        <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden" aria-hidden="true">
          <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground first-letter:uppercase">{motion.title}</p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <li>
          <Link
            prefetch={false}
            href={ROUTES.voteDetail(motion.slug)}
            className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
          >
            Le scrutin et les votes des députés
          </Link>
        </li>
        {motion.sourceUrl && (
          <li>
            <a
              href={motion.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center text-muted-foreground hover:underline"
            >
              Source : Assemblée nationale (nouvel onglet)
            </a>
          </li>
        )}
      </ul>
    </li>
  );
}

function GroupTable({ legislature }: { legislature: CensureLegislature }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <caption className="sr-only">
          Voix pour les motions de censure par groupe, {legislatureLabel(legislature.legislature)}
        </caption>
        <thead className="bg-muted/50 text-left">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">
              Groupe
            </th>
            <th scope="col" className="px-3 py-2 font-semibold text-right">
              Motions votées pendant son existence
            </th>
            <th scope="col" className="px-3 py-2 font-semibold text-right">
              Motions avec au moins une voix du groupe
            </th>
            <th scope="col" className="px-3 py-2 font-semibold text-right">
              Voix pour au total
            </th>
          </tr>
        </thead>
        <tbody>
          {legislature.groups.map((g) => (
            <tr key={g.organeRef} className="border-t">
              <th scope="row" className="px-3 py-2 text-left font-normal">
                {g.label}
                {g.abbreviation && g.abbreviation !== g.label && (
                  <span className="text-muted-foreground"> ({g.abbreviation})</span>
                )}
              </th>
              <td className="px-3 py-2 text-right tabular-nums">{g.motionsDuringGroup}</td>
              <td className="px-3 py-2 text-right tabular-nums">{g.motionsWithVotes}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {g.votesFor.toLocaleString("fr-FR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Deputies grouped by the number of motions they voted, highest first. A flat ranking showed the
 * first twenty of a tie of several dozen in alphabetical order, as if those names stood out. Every
 * name stays in the HTML; only the highest count is open by default.
 */
function DeputyRanking({ legislature }: { legislature: CensureLegislature }) {
  const total = legislature.motions.length;
  return (
    <div className="space-y-2">
      {groupDeputiesByCount(legislature.deputies).map(({ count, deputies }, i) => (
        <details key={count} open={i === 0} className="rounded-lg border">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 text-sm">
            <span className="font-semibold tabular-nums">
              {count} {count > 1 ? "motions" : "motion"} sur {total}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {deputies.length} député{deputies.length > 1 ? "s" : ""}
            </span>
          </summary>
          <ul className="grid gap-x-4 border-t px-4 py-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {deputies.map((d) => (
              <li key={d.slug} className="min-w-0">
                <Link
                  prefetch={false}
                  href={`/politiques/${d.slug}`}
                  className="inline-flex min-h-11 max-w-full items-center truncate hover:underline"
                >
                  {d.fullName}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

export default async function MotionsDeCensurePage() {
  const data = await getMotionsDeCensure();
  const motions = allMotions(data);
  const adopted = motions.filter((m) => m.adopted);
  const since = firstYear(data);
  const oldest = data.legislatures.at(-1);
  const url = `${SITE_URL}${ROUTES.motionsDeCensure}`;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Breadcrumb
        items={[
          { label: "Parlement", href: ROUTES.parlement },
          { label: "Votes", href: ROUTES.votes },
          { label: "Motions de censure" },
        ]}
      />
      <CollectionPageJsonLd
        name={pageTitle(data)}
        description={pageDescription(data)}
        url={url}
        numberOfItems={data.total}
      />
      <ItemListJsonLd
        name="Motions de censure votées à l'Assemblée nationale"
        url={url}
        itemKind="page"
        items={motions.map((m) => ({
          name: `Motion de censure du ${formatDate(m.votingDate)}`,
          url: `${SITE_URL}${ROUTES.voteDetail(m.slug)}`,
        }))}
      />

      <h1 className="text-3xl font-display font-extrabold tracking-tight mb-3">
        Motions de censure à l&apos;Assemblée nationale
      </h1>
      <p className="text-muted-foreground mb-2 max-w-2xl">
        {data.total.toLocaleString("fr-FR")} motions de censure votées
        {since ? ` depuis ${since}` : ""}, {data.adopted.toLocaleString("fr-FR")}{" "}
        {data.adopted > 1 ? "adoptées" : "adoptée"}
        {adopted.length > 0 &&
          ` : ${adopted
            .map(
              (m) => `le ${formatDate(m.votingDate)}${m.government ? `, ${m.government.name}` : ""}`
            )
            .join(" ; ")}`}
        .
      </p>

      <section aria-labelledby="regle" className="my-6 rounded-lg border bg-muted/30 p-4 text-sm">
        <h2 id="regle" className="font-semibold mb-2">
          Ce que mesurent ces chiffres
        </h2>
        <ul className="space-y-2 list-disc pl-5">
          <li>
            Une motion de censure est adoptée à la majorité des membres composant l&apos;Assemblée
            (article 49 de la Constitution). La majorité requise se calcule sur les sièges pourvus
            le jour du vote : 289 avec 577 députés, moins quand des sièges sont vacants.
          </li>
          <li>
            Seuls les votes pour la motion sont décomptés. L&apos;Assemblée n&apos;enregistre ni
            vote contre ni abstention : un député absent de la liste n&apos;a pas voté la motion,
            sans que l&apos;on sache s&apos;il était présent.
          </li>
          {oldest && (
            <li>
              La liste commence avec la {legislatureLabel(oldest.legislature)}
              {since ? `, en ${since}` : ""}. Les motions des législatures précédentes n&apos;y
              figurent pas.
            </li>
          )}
        </ul>
        <p className="mt-3">
          Sources :{" "}
          <a
            href={CONSTITUTION_SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="py-3.5 underline underline-offset-2"
          >
            Constitution, article 49 (Conseil constitutionnel)
          </a>{" "}
          ;{" "}
          <a
            href={AN_VOTES_OPEN_DATA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="py-3.5 underline underline-offset-2"
          >
            données ouvertes des scrutins de l&apos;Assemblée nationale
          </a>
          . Les liens s&apos;ouvrent dans un nouvel onglet.
        </p>
      </section>

      {data.legislatures.map((leg) => {
        const id = `legislature-${leg.legislature}`;
        return (
          <section key={leg.legislature} aria-labelledby={id} className="mb-12">
            <h2 id={id} className="text-2xl font-display font-bold mb-4">
              {legislatureLabel(leg.legislature)} : {leg.motions.length} motion
              {leg.motions.length > 1 ? "s" : ""}
            </h2>
            <ol className="space-y-3">
              {leg.motions.map((m) => (
                <MotionItem key={m.slug} motion={m} />
              ))}
            </ol>

            <h3 className="text-lg font-display font-semibold mt-8 mb-3">Voix pour par groupe</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Décompte de l&apos;Assemblée nationale pour chaque scrutin. Un groupe recréé en cours
              de législature apparaît sur deux lignes, comme dans la source. Ordre alphabétique.
            </p>
            <GroupTable legislature={leg} />

            <h3 className="text-lg font-display font-semibold mt-8 mb-3">
              Députés par nombre de motions votées
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              Nombre de motions de la législature que chaque député a votées. Un député arrivé ou
              parti en cours de législature n&apos;a pas pu voter toutes les motions.
            </p>
            <DeputyRanking legislature={leg} />
          </section>
        );
      })}
    </div>
  );
}
