"use client";

import { AFFAIR_STATUS_LABELS, CHAMBER_LABELS, MANDATE_TYPE_LABELS } from "@/config/labels";

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
    status: string;
    filingDate: string | null;
  }>;
  communes: Array<{
    id: string;
    name: string;
    departmentName: string;
    population: number | null;
  }>;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function categorizeResults(data: GlobalSearchResponse): SearchResultCategory[] {
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
        badge: AFFAIR_STATUS_LABELS[a.status as keyof typeof AFFAIR_STATUS_LABELS] ?? a.status,
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
        primary: d.shortTitle ?? d.title,
        secondary: d.status,
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
      key: "communes",
      label: "Communes",
      results: data.communes.map((c) => ({
        href: `/elections/municipales-2026/communes/${c.id}`,
        primary: c.name,
        secondary: c.departmentName,
      })),
    },
  ];

  return categories.filter((cat) => cat.results.length > 0);
}
