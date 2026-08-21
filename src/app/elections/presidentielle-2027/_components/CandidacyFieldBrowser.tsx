"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { getAccessibleTextColor } from "@/lib/contrast";
import type { HubCandidacy } from "@/lib/data/hub";
import {
  CANDIDACY_FILTERS,
  CANDIDACY_FILTER_LABELS,
  matchesCandidacyFilter,
  matchesCandidacyQuery,
  matchesPublishedProposals,
  parseCandidacyFilter,
  type CandidacyFilter,
} from "@/lib/presidentielle/candidacy-filters";
import { CandidacyStatusBadge } from "./CandidacyStatusBadge";

function initials(value: string): string {
  return value
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

function PartyIdentity({ candidacy }: { candidacy: HubCandidacy }) {
  const label = candidacy.partyLabel ?? "Sans rattachement renseigné";
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground-strong">
      {candidacy.partyLogoUrl ? (
        <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border bg-white">
          <Image
            src={candidacy.partyLogoUrl}
            alt=""
            fill
            sizes="32px"
            className="object-contain p-1"
          />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
          style={
            candidacy.partyColor
              ? {
                  backgroundColor: candidacy.partyColor,
                  color: getAccessibleTextColor(candidacy.partyColor),
                }
              : undefined
          }
        >
          {candidacy.partyShortName?.slice(0, 3).toUpperCase() ?? initials(label)}
        </span>
      )}
      <span className="min-w-0 break-words">{label}</span>
    </div>
  );
}

function PublishedContent({ candidacy }: { candidacy: HubCandidacy }) {
  if (candidacy.measureCount > 0) {
    return (
      <p className="text-sm font-medium text-foreground">
        {candidacy.themesCoveredCount === 1
          ? "Des propositions sont disponibles sur 1 thème"
          : `Des propositions sont disponibles sur ${candidacy.themesCoveredCount} thèmes`}
      </p>
    );
  }
  if (candidacy.programmeAbsence === "non_depouille") {
    return (
      <p className="text-sm text-muted-foreground-strong">
        Programme identifié, aucune proposition encore publiée sur Poligraph
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground-strong">
      Poligraph n&apos;a identifié aucun programme publié à ce jour
    </p>
  );
}

export function CandidacyCard({
  candidacy,
  onNavigate,
}: {
  candidacy: HubCandidacy;
  onNavigate?: () => void;
}) {
  return (
    <li className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-4">
        <div aria-hidden="true">
          <PoliticianAvatar
            photoUrl={candidacy.photoUrl}
            blobPhotoUrl={candidacy.blobPhotoUrl}
            fullName={candidacy.candidateName}
            size="lg"
            className="h-20 w-20 sm:h-24 sm:w-24"
          />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <h2 className="break-words font-display text-xl font-extrabold leading-tight tracking-tight">
            {candidacy.candidateName}
          </h2>
          <PartyIdentity candidacy={candidacy} />
        </div>
      </div>
      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <CandidacyStatusBadge status={candidacy.status} />
        <PublishedContent candidacy={candidacy} />
      </div>
      <div className="mt-auto pt-5">
        <Link
          href={`/elections/presidentielle-2027/candidats/${candidacy.politicianSlug}`}
          prefetch={false}
          onClick={onNavigate}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Voir le suivi 2027
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
          <span className="sr-only"> de {candidacy.candidateName}</span>
        </Link>
      </div>
    </li>
  );
}

export function CandidacyFieldBrowser({ candidacies }: { candidacies: HubCandidacy[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = parseCandidacyFilter(searchParams.get("statut"));
  const urlQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const submittedQuery = useRef<string | null>(null);
  const previousUrlQuery = useRef(urlQuery);
  const pendingQuerySync = useRef<number | null>(null);
  const publishedOnly = searchParams.get("propositions") === "publiees";
  const counts = Object.fromEntries(
    CANDIDACY_FILTERS.map((key) => [
      key,
      candidacies.filter((c) => matchesCandidacyFilter(c, key)).length,
    ])
  ) as Record<CandidacyFilter, number>;
  const visible = candidacies.filter(
    (c) =>
      matchesCandidacyFilter(c, status) &&
      matchesPublishedProposals(c, publishedOnly) &&
      matchesCandidacyQuery(c, query)
  );

  const cancelPendingQuerySync = useCallback(() => {
    if (pendingQuerySync.current === null) return;
    window.clearTimeout(pendingQuerySync.current);
    pendingQuerySync.current = null;
  }, []);

  const update = useCallback(
    function update(next: { statut?: CandidacyFilter; q?: string; publishedOnly?: boolean }) {
      cancelPendingQuerySync();
      const params = new URLSearchParams(searchParams.toString());
      if (next.statut !== undefined) {
        if (next.statut === "toutes") params.delete("statut");
        else params.set("statut", next.statut);
      }
      if (next.q !== undefined) {
        submittedQuery.current = next.q;
        if (next.q === "") params.delete("q");
        else params.set("q", next.q);
      }
      if (next.publishedOnly !== undefined) {
        if (next.publishedOnly) params.set("propositions", "publiees");
        else params.delete("propositions");
      }
      const value = params.toString();
      router.replace(value === "" ? "?" : `?${value}`, { scroll: false });
    },
    [cancelPendingQuerySync, router, searchParams]
  );

  useEffect(() => {
    if (previousUrlQuery.current === urlQuery) return;
    previousUrlQuery.current = urlQuery;

    if (submittedQuery.current === urlQuery) {
      submittedQuery.current = null;
      return;
    }
    const frame = window.requestAnimationFrame(() => setQuery(urlQuery));
    return () => window.cancelAnimationFrame(frame);
  }, [urlQuery]);

  useEffect(() => {
    if (query === urlQuery || submittedQuery.current === query) return;
    const timeout = window.setTimeout(() => {
      pendingQuerySync.current = null;
      update({ q: query });
    }, 250);
    pendingQuerySync.current = timeout;
    return () => {
      window.clearTimeout(timeout);
      if (pendingQuerySync.current === timeout) pendingQuerySync.current = null;
    };
  }, [query, update, urlQuery]);

  return (
    <div className="space-y-6">
      <div className="space-y-5 rounded-2xl border border-border bg-card p-4 md:p-5">
        <label className="block max-w-lg text-sm font-semibold">
          Rechercher une personne ou un parti
          <span className="mt-2 flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 font-normal focus-within:ring-2 focus-within:ring-primary">
            <Search aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent outline-none"
            />
          </span>
        </label>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Statut public</legend>
          <div className="flex flex-wrap gap-2">
            {CANDIDACY_FILTERS.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={key === status}
                onClick={() => update({ statut: key, q: query })}
                className={`min-h-11 rounded-full border px-4 text-sm ${
                  key === status
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-muted"
                }`}
              >
                {CANDIDACY_FILTER_LABELS[key]} ({counts[key]})
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            checked={publishedOnly}
            onChange={(event) => update({ q: query, publishedOnly: event.target.checked })}
            className="h-5 w-5 rounded border-border accent-primary"
          />
          Afficher uniquement les personnes avec des propositions publiées
        </label>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aucune personne ne correspond à ces critères.
          <button
            type="button"
            onClick={() => {
              setQuery("");
              update({ statut: "toutes", q: "", publishedOnly: false });
            }}
            className="ml-2 min-h-11 font-semibold text-primary underline"
          >
            Réinitialiser
          </button>
        </div>
      ) : (
        <ul className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((candidacy) => (
            <CandidacyCard
              key={candidacy.id}
              candidacy={candidacy}
              onNavigate={cancelPendingQuerySync}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
