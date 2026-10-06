"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, Plus, Check, Building2, Loader2 } from "lucide-react";
import { useWatchlist } from "@/hooks/useWatchlist";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { Button } from "@/components/ui/button";
import { MANDATE_TYPE_LABELS } from "@/config/labels";
import type { MandateType } from "@/generated/prisma";

interface SearchPolitician {
  slug: string;
  fullName: string;
  photoUrl: string | null;
  blobPhotoUrl: string | null;
  party: string | null;
  mandate: MandateType | null;
}

interface SearchParty {
  slug: string;
  name: string;
  shortName: string | null;
  color: string | null;
  memberCount: number;
}

interface SearchResults {
  politicians: SearchPolitician[];
  parties: SearchParty[];
}

export function WatchlistSearch() {
  const { toggle, isFollowing } = useWatchlist();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Autofocus on mount + cleanup debounce timer
  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const fetchResults = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search/watchlist?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error("Erreur serveur");
      const data: SearchResults = await res.json();
      setResults(data);
    } catch {
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (value.trim().length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(() => {
      fetchResults(value.trim());
    }, 300);
  };

  const hasResults = results && (results.politicians.length > 0 || results.parties.length > 0);
  const showEmpty = results && !hasResults && query.length >= 2 && !loading;

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Rechercher un politique ou un parti..."
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {/* Results */}
      {hasResults && (
        <div className="space-y-4">
          {/* Politicians */}
          {results.politicians.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Politiques
              </h3>
              <div className="space-y-1">
                {results.politicians.map((p) => {
                  const following = isFollowing(p.slug, "politician");
                  return (
                    <div
                      key={p.slug}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <PoliticianAvatar
                        photoUrl={p.photoUrl}
                        blobPhotoUrl={p.blobPhotoUrl}
                        fullName={p.fullName}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{p.fullName}</p>
                        <p className="text-xs text-muted-foreground">
                          {[p.party, p.mandate ? MANDATE_TYPE_LABELS[p.mandate] : null]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                      </div>
                      <Button
                        variant={following ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => toggle(p.slug, "politician")}
                        className="shrink-0"
                      >
                        {following ? (
                          <>
                            <Check className="size-3.5" />
                            Suivi
                          </>
                        ) : (
                          <>
                            <Plus className="size-3.5" />
                            Suivre
                          </>
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Parties */}
          {results.parties.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Partis
              </h3>
              <div className="space-y-1">
                {results.parties.map((p) => {
                  const following = isFollowing(p.slug, "party");
                  return (
                    <div
                      key={p.slug}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div
                        className="size-10 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: p.color ? `${p.color}20` : "#e5e7eb",
                        }}
                      >
                        <Building2
                          className="size-5"
                          style={{
                            color: p.color || "#6b7280",
                          }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.memberCount} membre{p.memberCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <Button
                        variant={following ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => toggle(p.slug, "party")}
                        className="shrink-0"
                      >
                        {following ? (
                          <>
                            <Check className="size-3.5" />
                            Suivi
                          </>
                        ) : (
                          <>
                            <Plus className="size-3.5" />
                            Suivre
                          </>
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty results */}
      {showEmpty && (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground mb-3">Aucun résultat pour « {query} »</p>
          <Button variant="outline" size="sm" asChild>
            <Link href="/politiques">Parcourir tous les politiques</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
