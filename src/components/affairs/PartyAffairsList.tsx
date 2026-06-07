"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { stripMarkdown } from "@/lib/utils";
import {
  AFFAIR_STATUS_LABELS,
  AFFAIR_STATUS_COLORS,
  AFFAIR_SUPER_CATEGORY_LABELS,
  AFFAIR_SUPER_CATEGORY_COLORS,
  CATEGORY_TO_SUPER,
  INVOLVEMENT_LABELS,
  INVOLVEMENT_COLORS,
  type AffairSuperCategory,
} from "@/config/labels";
import { AffairStatusNotice } from "@/components/affairs/AffairStatusNotice";
import { getJudicialMaturity } from "@/config/judicial-maturity";
import type { AffairCategory, AffairStatus, Involvement } from "@/types";

const MATURITY_TAB_LABELS: Record<string, string> = {
  ALL: "Toutes",
  CONDAMNATION: "Condamnations",
  PROCEDURE_VALIDEE: "Procédures validées",
  ENQUETE: "Enquêtes",
  CLOSE_SANS_CONDAMNATION: "Closes",
};

const MATURITY_TAB_COLORS: Record<string, string> = {
  CONDAMNATION: "border-red-500 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  PROCEDURE_VALIDEE:
    "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  ENQUETE: "border-gray-400 bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  CLOSE_SANS_CONDAMNATION:
    "border-green-500 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

export interface PartyAffair {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  category: string;
  involvement: string;
  sentence: string | null;
  verdictDate: Date | null;
  startDate: Date | null;
  factsDate: Date | null;
  politician: {
    id: string;
    fullName: string;
    slug: string;
  };
}

interface PartyAffairsListProps {
  affairs: PartyAffair[];
}

export function PartyAffairsList({ affairs }: PartyAffairsListProps) {
  const [maturityFilter, setMaturityFilter] = useState<string>("ALL");
  const [superCatFilter, setSuperCatFilter] = useState<AffairSuperCategory | null>(null);

  // Compute counts for tabs
  const maturityCounts: Record<string, number> = { ALL: affairs.length };
  const superCatCounts: Record<string, number> = {};
  for (const a of affairs) {
    const maturity = getJudicialMaturity(a.status as AffairStatus);
    maturityCounts[maturity] = (maturityCounts[maturity] || 0) + 1;
    const sc = CATEGORY_TO_SUPER[a.category as AffairCategory];
    superCatCounts[sc] = (superCatCounts[sc] || 0) + 1;
  }

  // Apply filters
  const filtered = affairs.filter((a) => {
    if (maturityFilter !== "ALL") {
      const maturity = getJudicialMaturity(a.status as AffairStatus);
      if (maturity !== maturityFilter) return false;
    }
    if (superCatFilter) {
      const sc = CATEGORY_TO_SUPER[a.category as AffairCategory];
      if (sc !== superCatFilter) return false;
    }
    return true;
  });

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Toutes les affaires ({affairs.length})</CardTitle>

        {/* Maturity tier tabs */}
        <div className="flex flex-wrap gap-2 mt-3">
          {Object.entries(MATURITY_TAB_LABELS).map(([key, label]) => {
            const count = maturityCounts[key] || 0;
            if (key !== "ALL" && count === 0) return null;
            const isActive = maturityFilter === key;
            return (
              <button
                key={key}
                onClick={() => setMaturityFilter(isActive && key !== "ALL" ? "ALL" : key)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  isActive
                    ? key === "ALL"
                      ? "border-foreground bg-foreground text-background"
                      : MATURITY_TAB_COLORS[key]
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {label}
                {key !== "ALL" && <span className="ml-1.5 tabular-nums opacity-70">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Super-category pills */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {Object.entries(superCatCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([key, count]) => {
              const sc = key as AffairSuperCategory;
              const isActive = superCatFilter === sc;
              return (
                <button
                  key={key}
                  onClick={() => setSuperCatFilter(isActive ? null : sc)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    isActive
                      ? AFFAIR_SUPER_CATEGORY_COLORS[sc]
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {AFFAIR_SUPER_CATEGORY_LABELS[sc]} ({count})
                </button>
              );
            })}
          {superCatFilter && (
            <button
              onClick={() => setSuperCatFilter(null)}
              className="px-2.5 py-1 rounded-full text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Effacer
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Results count when filtered */}
        {(maturityFilter !== "ALL" || superCatFilter) && (
          <p className="text-sm text-muted-foreground mb-4">
            {filtered.length} résultat{filtered.length !== 1 ? "s" : ""}
          </p>
        )}

        <div className="space-y-4">
          {filtered.length > 0 ? (
            filtered.map((affair) => {
              const superCat = CATEGORY_TO_SUPER[affair.category as AffairCategory];
              const relevantDate = affair.verdictDate || affair.startDate || affair.factsDate;
              return (
                <div key={affair.id} className="border-b last:border-b-0 pb-4 last:pb-0">
                  <div className="flex items-start gap-2 mb-2 flex-wrap">
                    {relevantDate && (
                      <Badge variant="secondary" className="font-mono">
                        {new Date(relevantDate).getFullYear()}
                      </Badge>
                    )}
                    <Badge className={AFFAIR_SUPER_CATEGORY_COLORS[superCat]}>
                      {AFFAIR_SUPER_CATEGORY_LABELS[superCat]}
                    </Badge>
                    <Badge className={AFFAIR_STATUS_COLORS[affair.status as AffairStatus]}>
                      {AFFAIR_STATUS_LABELS[affair.status as AffairStatus]}
                    </Badge>
                    <Badge className={INVOLVEMENT_COLORS[affair.involvement as Involvement]}>
                      {INVOLVEMENT_LABELS[affair.involvement as Involvement]}
                    </Badge>
                  </div>
                  <Link
                    href={`/affaires/${affair.slug}`}
                    className="text-lg font-semibold hover:underline"
                  >
                    {affair.title}
                  </Link>
                  <div className="mt-1">
                    <Link
                      href={`/politiques/${affair.politician.slug}`}
                      className="text-sm text-primary hover:underline"
                    >
                      {affair.politician.fullName}
                    </Link>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {stripMarkdown(affair.description)}
                  </p>
                  <AffairStatusNotice
                    status={affair.status as AffairStatus}
                    involvement={affair.involvement as Involvement}
                    className="mt-2"
                  />
                </div>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Aucune affaire ne correspond aux filtres sélectionnés
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
