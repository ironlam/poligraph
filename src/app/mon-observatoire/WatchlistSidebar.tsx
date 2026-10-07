"use client";

import { X, Building2, Plus, Check } from "lucide-react";
import { useWatchlist } from "@/hooks/useWatchlist";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { Button } from "@/components/ui/button";
import type { WatchlistPolitician, WatchlistParty } from "@/types/activity";

interface WatchlistSidebarProps {
  politicians: WatchlistPolitician[];
  parties: WatchlistParty[];
  selectedSlugs?: Set<string>;
  onToggleFilter?: (slug: string) => void;
  onClearFilter?: () => void;
  onAddClick?: () => void;
}

export function WatchlistSidebar({
  politicians,
  parties,
  selectedSlugs = new Set(),
  onToggleFilter,
  onClearFilter,
  onAddClick,
}: WatchlistSidebarProps) {
  const { items, remove } = useWatchlist();

  const hasActiveFilter = selectedSlugs.size > 0;

  // Slugs that are in items but not yet resolved into politicians/parties
  const resolvedPoliticianSlugs = new Set(politicians.map((p) => p.slug));
  const resolvedPartySlugs = new Set(parties.map((p) => p.slug));
  const unresolvedPoliticians = items.filter(
    (i) => i.type === "politician" && !resolvedPoliticianSlugs.has(i.slug)
  );
  const unresolvedParties = items.filter(
    (i) => i.type === "party" && !resolvedPartySlugs.has(i.slug)
  );

  return (
    <div className="space-y-6">
      {/* Clear filter button */}
      {hasActiveFilter && onClearFilter && (
        <button
          onClick={onClearFilter}
          className="text-xs text-primary hover:underline font-medium"
        >
          Tout afficher
        </button>
      )}

      {/* Politicians */}
      {(politicians.length > 0 || unresolvedPoliticians.length > 0) && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Politiques ({politicians.length + unresolvedPoliticians.length})
          </h3>
          <div className="space-y-1">
            {politicians.map((p) => {
              const isSelected = selectedSlugs.has(p.slug);
              return (
                <div
                  key={p.slug}
                  role="button"
                  tabIndex={0}
                  onClick={() => onToggleFilter?.(p.slug)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onToggleFilter?.(p.slug);
                    }
                  }}
                  className={`flex items-center gap-2 group rounded-md p-1.5 -mx-1.5 transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-primary/5 border-l-2 border-primary pl-2"
                      : "hover:bg-accent/50 border-l-2 border-transparent pl-2"
                  }`}
                >
                  <PoliticianAvatar
                    photoUrl={p.photoUrl}
                    blobPhotoUrl={p.blobPhotoUrl}
                    fullName={p.fullName}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{p.fullName}</p>
                    {p.party && <p className="text-xs text-muted-foreground">{p.party}</p>}
                  </div>
                  {isSelected ? (
                    <Check className="size-4 text-primary shrink-0" />
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(p.slug, "politician");
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      aria-label={`Retirer ${p.fullName}`}
                    >
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
            {/* Loading skeletons for unresolved politicians */}
            {unresolvedPoliticians.map((item) => (
              <div key={item.slug} className="flex items-center gap-2 p-1.5 -mx-1.5">
                <div className="size-10 rounded-full bg-muted animate-pulse shrink-0" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-3.5 w-24 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-16 bg-muted rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Parties */}
      {(parties.length > 0 || unresolvedParties.length > 0) && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Partis ({parties.length + unresolvedParties.length})
          </h3>
          <div className="space-y-1">
            {parties.map((p) => {
              const isSelected = selectedSlugs.has(p.slug);
              return (
                <div
                  key={p.slug}
                  role="button"
                  tabIndex={0}
                  onClick={() => onToggleFilter?.(p.slug)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onToggleFilter?.(p.slug);
                    }
                  }}
                  className={`flex items-center gap-2 group rounded-md p-1.5 -mx-1.5 transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-primary/5 border-l-2 border-primary pl-2"
                      : "hover:bg-accent/50 border-l-2 border-transparent pl-2"
                  }`}
                >
                  <div
                    className="size-10 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: p.color ? `${p.color}20` : "#e5e7eb",
                    }}
                  >
                    <Building2 className="size-5" style={{ color: p.color || "#6b7280" }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{p.shortName || p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.memberCount} membre{p.memberCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {isSelected ? (
                    <Check className="size-4 text-primary shrink-0" />
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(p.slug, "party");
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      aria-label={`Retirer ${p.shortName || p.name}`}
                    >
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
            {/* Loading skeletons for unresolved parties */}
            {unresolvedParties.map((item) => (
              <div key={item.slug} className="flex items-center gap-2 p-1.5 -mx-1.5">
                <div className="size-10 rounded-full bg-muted animate-pulse shrink-0" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-3.5 w-20 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-14 bg-muted rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add button */}
      {onAddClick && (
        <Button variant="outline" size="sm" className="w-full" onClick={onAddClick}>
          <Plus className="size-4" />
          Ajouter
        </Button>
      )}
    </div>
  );
}
