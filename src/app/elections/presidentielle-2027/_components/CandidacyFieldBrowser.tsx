"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ExternalLink, Search, UserRound } from "lucide-react";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { Button } from "@/components/ui/button";
import type { CandidacyStatus } from "@/generated/prisma";
import { getAccessibleTextColor } from "@/lib/contrast";
import type { HubCandidacy } from "@/lib/data/hub";
import {
  CANDIDACY_FILTERS,
  CANDIDACY_FILTER_LABELS,
  matchesCandidacyFilter,
  matchesCandidacyQuery,
  parseCandidacyFilter,
  type CandidacyFilter,
} from "@/lib/presidentielle/candidacy-filters";

const TOTAL_THEMES = 13;

const STATUS_LABELS: Record<CandidacyStatus, string> = {
  DECLARE: "Candidature déclarée",
  PRESSENTI: "Candidature pressentie",
  ENVISAGE: "Candidature évoquée",
  RETIRE: "Candidature retirée",
};

function statusLabel(status: CandidacyStatus | null): string {
  return status === null ? "Statut non renseigné" : STATUS_LABELS[status];
}

function PartyIdentity({ candidacy }: { candidacy: HubCandidacy }) {
  const initials =
    candidacy.partyShortName?.slice(0, 3) ??
    candidacy.candidateName
      .split(/\s+/)
      .map((part) => part[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase();

  const fallbackStyle = candidacy.partyColor
    ? {
        backgroundColor: candidacy.partyColor,
        color: getAccessibleTextColor(candidacy.partyColor),
      }
    : undefined;

  return (
    <span className="mt-1 flex min-w-0 items-center gap-2 text-sm text-muted-foreground-strong">
      {candidacy.partyLogoUrl ? (
        <Image
          src={candidacy.partyLogoUrl}
          alt=""
          width={32}
          height={32}
          data-party-logo="true"
          className="h-8 w-8 shrink-0 rounded-lg bg-white object-contain p-0.5 ring-1 ring-border"
        />
      ) : (
        <span
          aria-hidden="true"
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${
            candidacy.partyColor ? "" : "bg-muted text-muted-foreground-strong"
          }`}
          style={fallbackStyle}
        >
          {initials}
        </span>
      )}
      <span className="truncate">{candidacy.partyLabel ?? "Parti non renseigné"}</span>
    </span>
  );
}

function SourceLink({ candidacy }: { candidacy: HubCandidacy }) {
  if (candidacy.sourceUrl === null || candidacy.sourceLabel === null) return null;

  return (
    <a
      href={candidacy.sourceUrl}
      target="_blank"
      rel="nofollow noopener noreferrer"
      title={candidacy.sourceLabel}
      aria-label={`Source du statut de ${candidacy.candidateName} : ${candidacy.sourceLabel}`}
      className="inline-flex min-h-7 items-center gap-1 text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-primary"
    >
      Source du statut
      <ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0" />
    </a>
  );
}

function CoverageSummary({ candidacy }: { candidacy: HubCandidacy }) {
  if (candidacy.status === "RETIRE") {
    return (
      <div className="rounded-xl bg-muted/40 p-3">
        <p className="font-display text-sm font-bold">Candidature retirée</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground-strong">
          Les informations déjà publiées restent accessibles lorsqu&apos;une fiche existe.
        </p>
      </div>
    );
  }

  if (candidacy.measureCount > 0) {
    const measureLabel = `${candidacy.measureCount} mesure${
      candidacy.measureCount === 1 ? " publiée" : "s publiées"
    } sur Poligraph`;
    const themeLabel = `Disponibles dans ${candidacy.themesCoveredCount} des ${TOTAL_THEMES} sujets suivis`;

    return (
      <div className="rounded-xl bg-primary/5 p-3 ring-1 ring-primary/10">
        <p className="font-display text-base font-bold text-primary">{measureLabel}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground-strong">{themeLabel}</p>
      </div>
    );
  }

  const explanation =
    candidacy.programmeAbsence === "aucun_programme"
      ? "Aucun programme de campagne publié à ce jour."
      : candidacy.programmeAbsence === "non_depouille"
        ? "Un programme a été repéré ; ses mesures sont en cours de traitement par Poligraph."
        : "Cette candidature n’a pas encore été traitée par Poligraph.";

  return (
    <div data-programme-absence={candidacy.programmeAbsence} className="rounded-xl bg-muted/40 p-3">
      <p className="font-display text-sm font-bold">Aucune mesure publiée sur Poligraph</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground-strong">{explanation}</p>
    </div>
  );
}

function CandidateActions({ candidacy }: { candidacy: HubCandidacy }) {
  const slug = candidacy.politicianSlug;

  if (slug === null) {
    return (
      <p className="text-xs leading-relaxed text-muted-foreground-strong">
        Aucun profil politique n&apos;est encore disponible sur Poligraph.
      </p>
    );
  }

  if (!candidacy.ficheAvailable) {
    return (
      <div className="space-y-2">
        <Button asChild variant="outline" className="h-11 w-full justify-between">
          <Link href={`/politiques/${slug}`} prefetch={false}>
            Voir le profil politique
            <UserRound aria-hidden="true" className="h-4 w-4" />
          </Link>
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground-strong">
          La page de candidature n&apos;est pas encore publiée sur Poligraph.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Button asChild className="h-11 w-full justify-between">
        <Link href={`/elections/presidentielle-2027/candidats/${slug}`} prefetch={false}>
          Voir les mesures
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
          <span className="sr-only"> de {candidacy.candidateName}</span>
        </Link>
      </Button>
      <Button asChild variant="outline" className="h-11 w-full justify-between">
        <Link href={`/politiques/${slug}`} prefetch={false}>
          Profil politique
          <UserRound aria-hidden="true" className="h-4 w-4" />
          <span className="sr-only"> de {candidacy.candidateName}</span>
        </Link>
      </Button>
    </div>
  );
}

function CandidacyCard({ candidacy }: { candidacy: HubCandidacy }) {
  const isRetired = candidacy.status === "RETIRE";

  return (
    <li className="flex h-full flex-col rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <PoliticianAvatar
          photoUrl={candidacy.photoUrl}
          blobPhotoUrl={candidacy.blobPhotoUrl}
          fullName={candidacy.candidateName}
          size="lg"
          className="h-20 w-20 rounded-2xl ring-1 ring-border"
        />
        <div className="min-w-0 flex-1 pt-0.5">
          <h3
            className={`font-display text-lg font-bold leading-tight tracking-tight ${
              isRetired ? "text-muted-foreground-strong line-through" : ""
            }`}
          >
            {candidacy.candidateName}
          </h3>
          <PartyIdentity candidacy={candidacy} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span
          className={`inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-semibold ${
            isRetired
              ? "border-dashed border-border text-muted-foreground-strong"
              : "border-primary/25 bg-primary/5 text-primary"
          }`}
        >
          {statusLabel(candidacy.status)}
        </span>
        <SourceLink candidacy={candidacy} />
      </div>

      <div className="mt-3">
        <CoverageSummary candidacy={candidacy} />
      </div>

      <div className="mt-auto pt-4">
        <CandidateActions candidacy={candidacy} />
      </div>
    </li>
  );
}

export function CandidacyFieldBrowser({ candidacies }: { candidacies: HubCandidacy[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const filter = parseCandidacyFilter(searchParams.get("statut"));
  const query = searchParams.get("q") ?? "";

  const counts = Object.fromEntries(
    CANDIDACY_FILTERS.map((key) => [
      key,
      candidacies.filter((candidacy) => matchesCandidacyFilter(candidacy, key)).length,
    ])
  ) as Record<CandidacyFilter, number>;

  const withoutProgramme = candidacies.filter(
    (candidacy) => candidacy.programmeAbsence === "aucun_programme"
  ).length;

  const visible = candidacies.filter(
    (candidacy) =>
      matchesCandidacyFilter(candidacy, filter) && matchesCandidacyQuery(candidacy, query)
  );

  function update(next: { statut?: CandidacyFilter; q?: string }): void {
    const params = new URLSearchParams(searchParams.toString());
    if (next.statut !== undefined) {
      if (next.statut === "toutes") params.delete("statut");
      else params.set("statut", next.statut);
    }
    if (next.q !== undefined) {
      if (next.q === "") params.delete("q");
      else params.set("q", next.q);
    }
    const queryString = params.toString();
    router.replace(queryString === "" ? "?" : `?${queryString}`, { scroll: false });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <label className="flex min-h-11 items-center gap-2 rounded-[10px] border border-border px-3 sm:max-w-sm">
          <Search aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="sr-only">Rechercher une candidature</span>
          <input
            type="search"
            value={query}
            onChange={(event) => update({ q: event.target.value })}
            placeholder="Rechercher un nom ou un parti"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>

        <div role="group" aria-label="Filtrer les candidatures" className="flex flex-wrap gap-2">
          {CANDIDACY_FILTERS.map((key) => {
            const active = key === filter;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => update({ statut: key })}
                className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-muted"
                }`}
              >
                {CANDIDACY_FILTER_LABELS[key]} · {counts[key]}
              </button>
            );
          })}
        </div>

        {withoutProgramme > 0 && (
          <p className="text-sm text-muted-foreground-strong">
            {withoutProgramme} candidature{withoutProgramme === 1 ? " n’a" : "s n’ont"} publié aucun
            programme à ce jour.
          </p>
        )}
      </div>

      <p aria-live="polite" className="text-sm text-muted-foreground">
        {visible.length} candidature{visible.length === 1 ? "" : "s"} affichée
        {visible.length === 1 ? "" : "s"}.
      </p>

      {visible.length > 0 ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {visible.map((candidacy) => (
            <CandidacyCard key={candidacy.id} candidacy={candidacy} />
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Aucune candidature ne correspond à cette recherche.
        </div>
      )}
    </div>
  );
}
