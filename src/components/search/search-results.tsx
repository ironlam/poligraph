"use client";

import {
  AFFAIR_STATUS_LABELS,
  CHAMBER_LABELS,
  INVOLVEMENT_LABELS,
  MANDATE_TYPE_LABELS,
} from "@/config/labels";
import { isAccusedInvolvement } from "@/config/certainty";
import { territoireCommunePath, territoireDepartementPath } from "@/lib/territoires/paths";
import type { AffairStatus, Involvement } from "@/generated/prisma";

export interface SearchResultCategory {
  key: string;
  label: string;
  results: Array<{
    href: string;
    primary: string;
    secondary?: string;
    badge?: string;
    badgeColor?: string;
    avatarUrl?: string | null;
  }>;
}

export interface GlobalSearchResponse {
  politicians: Array<{
    slug: string;
    fullName: string;
    photoUrl: string | null;
    party: string | null;
    partyColor: string | null;
    mandate: string | null;
  }>;
  parties: Array<{
    slug: string;
    name: string;
    shortName: string;
    color: string | null;
    memberCount: number;
  }>;
  affairs: Array<{
    slug: string;
    title: string;
    status: string;
    involvement: string;
    politicianName: string;
    politicianSlug: string;
  }>;
  scrutins: Array<{
    slug: string | null;
    id: string;
    title: string;
    votingDate: string;
    chamber: string;
  }>;
  factchecks: Array<{
    slug: string;
    title: string;
    source: string;
    verdictRating: string | null;
    publishedAt: string;
    politicianName: string | null;
  }>;
  dossiers: Array<{
    slug: string;
    title: string;
    shortTitle: string | null;
    aliasLabel: string | null;
    status: string;
    filingDate: string | null;
  }>;
  communes: Array<{
    /** INSEE code */
    id: string;
    name: string;
    departmentName: string;
    population: number | null;
  }>;
  /** Matched from the static department list. Optional: older responses did not carry it. */
  departements?: Array<{
    code: string;
    name: string;
    slug: string;
  }>;
}

/**
 * Badge d'un résultat d'affaire : le statut décrit la personne poursuivie, il n'est affiché
 * que lorsque c'est l'élu du résultat ; sinon le badge donne son rôle (témoin, victime...).
 */
export function affairResultBadge(affair: { status: string; involvement: string }): string {
  const involvement = affair.involvement as Involvement;
  if (!isAccusedInvolvement(involvement)) {
    return INVOLVEMENT_LABELS[involvement] ?? affair.involvement;
  }
  return AFFAIR_STATUS_LABELS[affair.status as AffairStatus] ?? affair.status;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Lower case, accents and punctuation folded, so "Saint-Étienne" and "saint etienne" compare equal. */
function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const POSTAL_CODE = /^\d{5}$/;

/**
 * Whether the query reads as a place rather than a person, which puts Territoires first.
 *
 * A postal code, or the exact name of a commune or department returned, is a place. A prefix of a
 * commune name is one too, unless a returned person's name also contains the query: "Paris" is a
 * commune, "Bayrou" is a person, and "Saint-Ex" with no person behind it is a commune being typed.
 */
export function isTerritoireQuery(query: string, data: GlobalSearchResponse): boolean {
  const q = fold(query);
  if (!q) return false;
  if (POSTAL_CODE.test(query.trim())) return true;

  const placeNames = [
    ...data.communes.map((c) => fold(c.name)),
    ...(data.departements ?? []).map((d) => fold(d.name)),
  ];
  if (placeNames.some((name) => name === q)) return true;

  const personMatches = data.politicians.some((p) => fold(p.fullName).includes(q));
  return !personMatches && placeNames.some((name) => name.startsWith(q));
}

export function categorizeResults(data: GlobalSearchResponse, query = ""): SearchResultCategory[] {
  const categories: SearchResultCategory[] = [
    {
      key: "politicians",
      label: "Politiques",
      results: data.politicians.map((p) => ({
        href: `/politiques/${p.slug}`,
        primary: p.fullName,
        secondary: p.mandate
          ? (MANDATE_TYPE_LABELS[p.mandate as keyof typeof MANDATE_TYPE_LABELS] ?? p.mandate)
          : undefined,
        badge: p.party ?? undefined,
        badgeColor: p.partyColor ?? undefined,
        avatarUrl: p.photoUrl,
      })),
    },
    {
      key: "scrutins",
      label: "Votes",
      results: data.scrutins.map((s) => ({
        href: `/parlement/votes/${s.slug ?? s.id}`,
        primary: s.title,
        secondary: [
          CHAMBER_LABELS[s.chamber as keyof typeof CHAMBER_LABELS] ?? s.chamber,
          formatDate(s.votingDate),
        ].join(" - "),
      })),
    },
    {
      key: "affairs",
      label: "Affaires",
      results: data.affairs.map((a) => ({
        href: `/affaires/${a.slug}`,
        primary: a.title,
        secondary: a.politicianName,
        badge: affairResultBadge(a),
      })),
    },
    {
      key: "parties",
      label: "Partis",
      results: data.parties.map((p) => ({
        href: `/partis/${p.slug}`,
        primary: p.name,
        secondary: `${p.memberCount} membres`,
        badgeColor: p.color ?? undefined,
      })),
    },
    {
      key: "dossiers",
      label: "Dossiers",
      results: data.dossiers.map((d) => ({
        href: `/parlement/dossiers/${d.slug}`,
        primary: d.aliasLabel ?? d.shortTitle ?? d.title,
        secondary: d.aliasLabel ? `Dossier associé : ${d.title}` : d.status,
      })),
    },
    {
      key: "factchecks",
      label: "Fact-checks",
      results: data.factchecks.map((f) => ({
        href: `/factchecks/${f.slug}`,
        primary: f.title,
        secondary: f.source,
      })),
    },
    {
      key: "territoires",
      label: "Territoires",
      results: [
        ...(data.departements ?? []).map((d) => ({
          href: territoireDepartementPath(d.slug),
          primary: d.name,
          secondary: `Département (${d.code})`,
        })),
        ...data.communes.map((c) => ({
          href: territoireCommunePath(c.id),
          primary: c.name,
          secondary: `Commune, ${c.departmentName}`,
        })),
      ],
    },
  ];

  if (isTerritoireQuery(query, data)) {
    const index = categories.findIndex((cat) => cat.key === "territoires");
    categories.unshift(...categories.splice(index, 1));
  }

  return categories.filter((cat) => cat.results.length > 0);
}
