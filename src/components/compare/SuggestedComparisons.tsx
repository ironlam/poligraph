"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import type { CompareCategory } from "@/types/compare";

interface Suggestion {
  leftSlug: string;
  leftName: string;
  rightSlug: string;
  rightName: string;
}

// Fallback for when API is unavailable
const FALLBACK_SUGGESTIONS: Suggestion[] = [
  {
    leftSlug: "jean-luc-melenchon",
    leftName: "Jean-Luc Mélenchon",
    rightSlug: "marine-le-pen",
    rightName: "Marine Le Pen",
  },
  {
    leftSlug: "jordan-bardella",
    leftName: "Jordan Bardella",
    rightSlug: "mathilde-panot",
    rightName: "Mathilde Panot",
  },
  {
    leftSlug: "emmanuel-macron",
    leftName: "Emmanuel Macron",
    rightSlug: "jean-luc-melenchon",
    rightName: "Jean-Luc Mélenchon",
  },
];

const PARTY_SUGGESTIONS: Suggestion[] = [
  {
    leftSlug: "la-france-insoumise",
    leftName: "La France Insoumise",
    rightSlug: "rassemblement-national",
    rightName: "Rassemblement National",
  },
  {
    leftSlug: "renaissance",
    leftName: "Renaissance",
    rightSlug: "rassemblement-national",
    rightName: "Rassemblement National",
  },
  {
    leftSlug: "parti-socialiste",
    leftName: "Parti Socialiste",
    rightSlug: "les-republicains",
    rightName: "Les Républicains",
  },
  {
    leftSlug: "ecologiste-et-social",
    leftName: "Écologistes",
    rightSlug: "rassemblement-national",
    rightName: "Rassemblement National",
  },
];

function getFallback(category: CompareCategory): Suggestion[] {
  return category === "partis" || category === "groupes" ? PARTY_SUGGESTIONS : FALLBACK_SUGGESTIONS;
}

interface SuggestedComparisonsProps {
  category: CompareCategory;
}

export function SuggestedComparisons({ category }: SuggestedComparisonsProps) {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<Suggestion[]>(getFallback(category));
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  /* eslint-disable react-hooks/set-state-in-effect -- data fetching effect */
  useEffect(() => {
    setIsLoading(true);
    fetch(`/api/compare/suggestions?cat=${category}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.length > 0) {
          setSuggestions(data);
        }
      })
      .catch(() => {
        // Keep fallback
      })
      .finally(() => setIsLoading(false));
  }, [category]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleClick = (s: Suggestion) => {
    const href = `/comparer?cat=${category}&a=${s.leftSlug}&b=${s.rightSlug}`;
    // Notify selectors so they show skeleton immediately
    window.dispatchEvent(new CustomEvent("compare-navigating"));
    startTransition(() => {
      router.push(href);
    });
  };

  if (isPending) {
    return (
      <div className="py-8" aria-busy="true">
        {/* Selectors skeleton */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div>
            <Skeleton className="h-4 w-20 mb-2" />
            <div className="bg-muted rounded-lg p-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            </div>
          </div>
          <div>
            <Skeleton className="h-4 w-20 mb-2" />
            <div className="bg-muted rounded-lg p-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* VS separator skeleton */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex-1 h-px bg-border" />
          <span className="px-4 text-2xl font-bold text-muted-foreground">VS</span>
          <div className="flex-1 h-px bg-border" />
        </div>
        {/* Comparison table skeleton */}
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="py-8">
      <h2 className="text-lg font-semibold text-center mb-6">Comparaisons populaires</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
        {isLoading
          ? [...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)
          : suggestions.map((s) => (
              <button
                key={`${s.leftSlug}-${s.rightSlug}`}
                onClick={() => handleClick(s)}
                className="flex items-center justify-center gap-3 rounded-lg border bg-card p-4 text-sm transition-all hover:shadow-md hover:border-primary/20 cursor-pointer"
              >
                <span className="font-medium text-right flex-1">{s.leftName}</span>
                <span className="text-muted-foreground font-bold text-xs shrink-0">VS</span>
                <span className="font-medium text-left flex-1">{s.rightName}</span>
              </button>
            ))}
      </div>
    </div>
  );
}
