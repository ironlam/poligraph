import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  BandeauFilAriane,
  BandeauSurtitre,
  RubriqueBandeau,
} from "@/components/ui/RubriqueBandeau";
import { HemicycleDecor } from "@/components/ui/HemicycleDecor";
import { CHAMBER_COMPARISON, CHAMBER_PROFILES, SENAT_ACCENT, chamberPath } from "@/config/chambres";
import { VOTING_RESULT_LABELS } from "@/config/labels";
import { ROUTES } from "@/config/routes";
import { BRAND_NAVY } from "@/config/brand";
import type { ChamberOverview } from "@/lib/data/chambres";
import type { Chamber } from "@/generated/prisma";

const OTHER_CHAMBER: Record<Chamber, Chamber> = { AN: "SENAT", SENAT: "AN" };

interface Entree {
  href: string;
  title: string;
  detail: string;
}

function entrees(chamber: Chamber): Entree[] {
  const profile = CHAMBER_PROFILES[chamber];
  const list: Entree[] = [
    {
      href: `${ROUTES.votes}?chamber=${chamber}`,
      title: `Scrutins ${chamber === "AN" ? "de l'Assemblée" : "du Sénat"}`,
      detail: "Par date, thème ou résultat.",
    },
    {
      href: ROUTES.dossiers,
      title: "Lois en construction",
      detail: "Textes déposés, discutés, amendés ou adoptés.",
    },
    {
      href: ROUTES.groupes,
      title: "Groupes parlementaires",
      detail: `Composition ${chamber === "AN" ? "de l'Assemblée" : "du Sénat"}.`,
    },
    {
      href: `/politiques?mandate=${profile.mandateFilter}`,
      title: `Les ${profile.members} ${profile.memberLabel}`,
      detail: "Fiches, votes et mandats.",
    },
  ];
  if (chamber === "AN") {
    list.push({
      href: ROUTES.legislatures,
      title: "Législatures",
      detail: "15e, 16e et 17e : dates et données disponibles.",
    });
  }
  return list;
}

export function ChambrePage({
  chamber,
  overview,
}: {
  chamber: Chamber;
  overview: ChamberOverview;
}) {
  const profile = CHAMBER_PROFILES[chamber];
  const other = CHAMBER_PROFILES[OTHER_CHAMBER[chamber]];
  const titleId = `${profile.slug}-titre`;
  const dateFormat = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <RubriqueBandeau labelledBy={titleId}>
        <div className="relative">
          <HemicycleDecor className="pointer-events-none absolute -right-8 top-0 hidden h-56 w-auto sm:block lg:right-4 lg:h-64" />
          <div className="relative max-w-3xl">
            <BandeauFilAriane
              items={[{ label: "Parlement", href: ROUTES.parlement }, { label: profile.name }]}
            />
            <div className="mt-4">
              <BandeauSurtitre>{profile.tagline}</BandeauSurtitre>
            </div>
            <h1
              id={titleId}
              className="mt-4 font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl"
            >
              {profile.name}
            </h1>
            <p className="mt-4 max-w-2xl text-base text-white/85 sm:text-lg">{profile.intro}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`${ROUTES.votes}?chamber=${chamber}`}
                className="inline-flex min-h-11 items-center rounded-lg bg-white px-5 text-sm font-bold text-primary hover:bg-white/90"
              >
                Voir les derniers scrutins
              </Link>
              <Link
                href={`/politiques?mandate=${profile.mandateFilter}`}
                className="inline-flex min-h-11 items-center rounded-lg border border-white/60 px-5 text-sm font-bold text-white hover:bg-white/10"
              >
                Voir les {profile.memberLabel}
              </Link>
            </div>
          </div>
        </div>
      </RubriqueBandeau>

      <div className="container mx-auto space-y-12 px-4 py-10">
        <section aria-labelledby="role">
          <h2 id="role" className="font-display text-2xl font-extrabold text-primary">
            À quoi sert {chamber === "AN" ? "l'Assemblée nationale" : "le Sénat"} ?
          </h2>
          <ul className="mt-5 grid gap-3 md:grid-cols-3">
            {profile.roles.map((role) => (
              <li
                key={role.title}
                className="rounded-2xl border border-border bg-card p-5"
                style={{ borderTop: `4px solid ${profile.accent}` }}
              >
                <h3 className="font-display text-lg font-bold">{role.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{role.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-label="Repères"
          className="grid gap-5 rounded-2xl border border-border bg-card p-6 sm:grid-cols-2 lg:grid-cols-4"
        >
          {profile.facts.map((fact) => (
            <div key={fact.label}>
              <p
                className="font-display text-4xl font-extrabold tabular-nums"
                style={{ color: profile.accent }}
              >
                {fact.value}
              </p>
              <p className="text-sm text-muted-foreground">{fact.label}</p>
            </div>
          ))}
          <div>
            <p className="font-display text-4xl font-extrabold tabular-nums text-brand-on-surface">
              {overview.totalScrutins.toLocaleString("fr-FR")}
            </p>
            <p className="text-sm text-muted-foreground">scrutins suivis par Poligraph</p>
          </div>
        </section>

        <section aria-labelledby="explorer">
          <h2 id="explorer" className="font-display text-2xl font-extrabold text-primary">
            Explorer les données {chamber === "AN" ? "de l'Assemblée" : "du Sénat"}
          </h2>
          <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {entrees(chamber).map((entree) => (
              <li key={entree.title}>
                <Link
                  href={entree.href}
                  prefetch={false}
                  className="flex h-full min-h-11 flex-col rounded-2xl border border-border bg-card p-4 hover:border-primary/40 hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  style={{ borderTop: `4px solid ${profile.accent}` }}
                >
                  <span className="font-display text-lg font-bold">{entree.title}</span>
                  <span className="mt-1 text-sm text-muted-foreground">{entree.detail}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="derniers">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="derniers" className="font-display text-2xl font-extrabold text-primary">
              Derniers scrutins {chamber === "AN" ? "à l'Assemblée" : "au Sénat"}
            </h2>
            <Link
              href={`${ROUTES.votes}?chamber=${chamber}`}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-primary hover:underline"
            >
              Tous les scrutins <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
          {overview.latestScrutins.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {overview.latestScrutins.map((s) => (
                <li key={s.id}>
                  <Link
                    href={s.slug ? ROUTES.voteDetail(s.slug) : ROUTES.votes}
                    prefetch={false}
                    className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted/40"
                  >
                    <time
                      dateTime={s.votingDate.toISOString()}
                      className="text-sm text-muted-foreground"
                    >
                      {dateFormat.format(s.votingDate)}
                    </time>
                    <span className="min-w-0 flex-1 basis-72 font-medium">{s.title}</span>
                    <span className="rounded-full border border-border px-3 py-0.5 text-xs font-bold">
                      {VOTING_RESULT_LABELS[s.result]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Aucun scrutin recensé pour cette chambre à ce jour.
            </p>
          )}
        </section>

        <section aria-labelledby="comparaison">
          <h2 id="comparaison" className="font-display text-2xl font-extrabold text-primary">
            Sénat et Assemblée : ce qui change
          </h2>
          <div className="mt-5 overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <caption className="sr-only">
                Comparaison entre le Sénat et l{"'"}Assemblée nationale
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="p-3 text-left font-bold">
                    <span className="sr-only">Critère</span>
                  </th>
                  <th
                    scope="col"
                    className="p-3 text-left font-bold text-white"
                    style={{ backgroundColor: SENAT_ACCENT }}
                  >
                    Sénat
                  </th>
                  <th
                    scope="col"
                    className="p-3 text-left font-bold text-white"
                    style={{ backgroundColor: BRAND_NAVY }}
                  >
                    Assemblée nationale
                  </th>
                </tr>
              </thead>
              <tbody>
                {CHAMBER_COMPARISON.map((row) => (
                  <tr key={row.question} className="border-t border-border">
                    <th scope="row" className="p-3 text-left font-medium">
                      {row.question}
                    </th>
                    <td className="p-3">{row.senat}</td>
                    <td className="p-3">{row.an}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside
          className="flex flex-wrap items-center justify-between gap-4 rounded-2xl p-6 text-white"
          style={{ backgroundColor: other.accent }}
        >
          <p className="max-w-xl text-base">
            {chamber === "AN"
              ? "Un texte voté ici est ensuite examiné par le Sénat. Voyez ce que fait l'autre chambre."
              : "Un texte adopté ici repart vers l'Assemblée nationale tant que les deux chambres ne sont pas d'accord."}
          </p>
          <Link
            href={chamberPath(other.chamber)}
            className="inline-flex min-h-11 items-center rounded-lg bg-white px-5 text-sm font-bold"
            style={{ color: other.accent }}
          >
            Découvrir {other.chamber === "AN" ? "l'Assemblée" : "le Sénat"}
          </Link>
        </aside>

        <p className="max-w-3xl text-xs text-muted-foreground">
          Poligraph est un outil d{"'"}information citoyenne et ne constitue pas une source
          juridique. Les données présentées peuvent être incomplètes. Sources : données ouvertes de
          l{"'"}Assemblée nationale et du Sénat.
        </p>
      </div>
    </>
  );
}
