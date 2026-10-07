"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";

// ---------------------------------------------------------------------------
// Inclusive French labels for mandate types
// ---------------------------------------------------------------------------
const MANDATE_INCLUSIVE_LABELS: Record<string, string> = {
  DEPUTE: "Député·e",
  SENATEUR: "Sénateur·ice",
  DEPUTE_EUROPEEN: "Député·e européen·ne",
  MINISTRE: "Ministre",
  SECRETAIRE_ETAT: "Secrétaire d'État",
  PREMIER_MINISTRE: "Premier·ère ministre",
};

function mandateLabel(type: string): string {
  return MANDATE_INCLUSIVE_LABELS[type] ?? type;
}

/** Normalize ALL-CAPS list names to title case. Preserve mixed-case names. */
function normalizeListLabel(raw: string): string {
  // Only normalize if the string is entirely uppercase (ignoring digits/punctuation)
  const letters = raw.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length === 0 || letters !== letters.toUpperCase()) return raw;
  return raw.replace(/[A-Za-zÀ-ÿ]+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CumulCandidate {
  id: string;
  candidateName: string;
  listName: string | null;
  listPosition: number | null;
  communeId: string | null;
  commune: { name: string; departmentCode: string } | null;
  politician: {
    id: string;
    slug: string;
    fullName: string;
    photoUrl: string | null;
    blobPhotoUrl: string | null;
    currentParty: { shortName: string; color: string | null } | null;
    mandates: Array<{ type: string }>;
  } | null;
}

interface CumulTableProps {
  candidates: CumulCandidate[];
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------
type SortKey = "name" | "mandate" | "department" | "party";
type SortDir = "asc" | "desc";

function getSortValue(c: CumulCandidate, key: SortKey): string {
  switch (key) {
    case "name":
      return c.politician?.fullName ?? c.candidateName;
    case "mandate":
      return c.politician?.mandates[0]?.type ?? "";
    case "department":
      return c.commune?.departmentCode ?? "";
    case "party":
      return c.politician?.currentParty?.shortName ?? "";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function CumulTable({ candidates }: CumulTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = useMemo(() => {
    return [...candidates].sort((a, b) => {
      const va = getSortValue(a, sortKey).toLowerCase();
      const vb = getSortValue(b, sortKey).toLowerCase();
      const cmp = va.localeCompare(vb, "fr");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [candidates, sortKey, sortDir]);

  const arrow = (key: SortKey) => {
    if (sortKey !== key) return null;
    return <span className="ml-1">{sortDir === "asc" ? "\u25B2" : "\u25BC"}</span>;
  };

  if (candidates.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-8">
        Aucun cumul de mandat détecté pour le moment.
      </p>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Candidats en cumul de mandats</caption>
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th
                scope="col"
                className="py-3 px-2 font-medium cursor-pointer select-none hover:text-foreground transition-colors"
                onClick={() => toggleSort("name")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleSort("name");
                  }
                }}
                tabIndex={0}
                role="button"
                aria-sort={
                  sortKey === "name" ? (sortDir === "asc" ? "ascending" : "descending") : "none"
                }
              >
                Nom{arrow("name")}
              </th>
              <th
                scope="col"
                className="py-3 px-2 font-medium cursor-pointer select-none hover:text-foreground transition-colors"
                onClick={() => toggleSort("mandate")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleSort("mandate");
                  }
                }}
                tabIndex={0}
                role="button"
                aria-sort={
                  sortKey === "mandate" ? (sortDir === "asc" ? "ascending" : "descending") : "none"
                }
              >
                Mandat national{arrow("mandate")}
              </th>
              <th
                scope="col"
                className="py-3 px-2 font-medium cursor-pointer select-none hover:text-foreground transition-colors"
                onClick={() => toggleSort("department")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleSort("department");
                  }
                }}
                tabIndex={0}
                role="button"
                aria-sort={
                  sortKey === "department"
                    ? sortDir === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                Commune{arrow("department")}
              </th>
              <th
                scope="col"
                className="py-3 px-2 font-medium cursor-pointer select-none hover:text-foreground transition-colors"
                onClick={() => toggleSort("party")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleSort("party");
                  }
                }}
                tabIndex={0}
                role="button"
                aria-sort={
                  sortKey === "party" ? (sortDir === "asc" ? "ascending" : "descending") : "none"
                }
              >
                Parti{arrow("party")}
              </th>
              <th scope="col" className="py-3 px-2 font-medium">
                Liste
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <tr
                key={c.id}
                className="border-b last:border-0 hover:bg-accent/50 transition-colors"
              >
                {/* Name + avatar */}
                <td className="py-3 px-2">
                  <div className="flex items-center gap-2">
                    {c.politician && (
                      <PoliticianAvatar
                        photoUrl={c.politician.photoUrl}
                        blobPhotoUrl={c.politician.blobPhotoUrl}
                        fullName={c.politician.fullName}
                        size="sm"
                        className="w-8 h-8 text-xs"
                      />
                    )}
                    {c.politician ? (
                      <Link
                        href={`/politiques/${c.politician.slug}`}
                        prefetch={false}
                        className="font-medium hover:text-primary transition-colors"
                      >
                        {c.politician.fullName}
                      </Link>
                    ) : (
                      <span className="font-medium">{c.candidateName}</span>
                    )}
                  </div>
                </td>
                {/* Mandate badge */}
                <td className="py-3 px-2">
                  {c.politician?.mandates.map((m, i) => (
                    <Badge key={i} variant="secondary" className="text-xs mr-1">
                      {mandateLabel(m.type)}
                    </Badge>
                  ))}
                </td>
                {/* Commune */}
                <td className="py-3 px-2">
                  {c.commune && c.communeId ? (
                    <Link
                      href={`/elections/municipales-2026/communes/${c.communeId}`}
                      prefetch={false}
                      className="hover:text-primary transition-colors"
                    >
                      {c.commune.name}{" "}
                      <span className="text-muted-foreground">({c.commune.departmentCode})</span>
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                {/* Party */}
                <td className="py-3 px-2">
                  {c.politician?.currentParty ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: c.politician.currentParty.color || "#9ca3af",
                        }}
                        aria-hidden="true"
                      />
                      {c.politician.currentParty.shortName}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                {/* List name */}
                <td className="py-3 px-2 max-w-[200px]">
                  <span
                    className="text-muted-foreground block"
                    title={c.listName ? normalizeListLabel(c.listName) : undefined}
                  >
                    {c.listName ? normalizeListLabel(c.listName) : "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card layout */}
      <div className="md:hidden space-y-3">
        {sorted.map((c) => (
          <div key={c.id} className="border rounded-lg p-3">
            {/* Header: avatar + name */}
            <div className="flex items-center gap-2 mb-2">
              {c.politician && (
                <PoliticianAvatar
                  photoUrl={c.politician.photoUrl}
                  blobPhotoUrl={c.politician.blobPhotoUrl}
                  fullName={c.politician.fullName}
                  size="sm"
                  className="w-8 h-8 text-xs"
                />
              )}
              <div className="min-w-0 flex-1">
                {c.politician ? (
                  <Link
                    href={`/politiques/${c.politician.slug}`}
                    prefetch={false}
                    className="font-medium hover:text-primary transition-colors block"
                  >
                    {c.politician.fullName}
                  </Link>
                ) : (
                  <span className="font-medium block">{c.candidateName}</span>
                )}
                {c.politician?.currentParty && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: c.politician.currentParty.color || "#9ca3af",
                      }}
                      aria-hidden="true"
                    />
                    {c.politician.currentParty.shortName}
                  </span>
                )}
              </div>
            </div>

            {/* Mandate badges */}
            <div className="flex flex-wrap gap-1 mb-2">
              {c.politician?.mandates.map((m, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {mandateLabel(m.type)}
                </Badge>
              ))}
            </div>

            {/* Commune */}
            {c.commune && c.communeId && (
              <Link
                href={`/elections/municipales-2026/communes/${c.communeId}`}
                prefetch={false}
                className="text-sm text-primary hover:underline"
              >
                {c.commune.name} ({c.commune.departmentCode})
              </Link>
            )}

            {/* List name */}
            {c.listName && (
              <p
                className="text-xs text-muted-foreground mt-1"
                title={normalizeListLabel(c.listName)}
              >
                {normalizeListLabel(c.listName)}
              </p>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
