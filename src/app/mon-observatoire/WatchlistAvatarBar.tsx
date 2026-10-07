"use client";

import { Building2 } from "lucide-react";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import type { WatchlistPolitician, WatchlistParty } from "@/types/activity";

interface WatchlistAvatarBarProps {
  politicians: WatchlistPolitician[];
  parties: WatchlistParty[];
  selectedSlugs: Set<string>;
  onToggleFilter: (slug: string) => void;
}

export function WatchlistAvatarBar({
  politicians,
  parties,
  selectedSlugs,
  onToggleFilter,
}: WatchlistAvatarBarProps) {
  if (politicians.length === 0 && parties.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
      {politicians.map((p) => {
        const isSelected = selectedSlugs.has(p.slug);
        return (
          <button
            key={p.slug}
            onClick={() => onToggleFilter(p.slug)}
            className={`shrink-0 rounded-full transition-all ${
              isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "opacity-70"
            }`}
            aria-label={`Filtrer par ${p.fullName}`}
            aria-pressed={isSelected}
            title={p.fullName}
          >
            <PoliticianAvatar
              photoUrl={p.photoUrl}
              blobPhotoUrl={p.blobPhotoUrl}
              fullName={p.fullName}
              size="sm"
            />
          </button>
        );
      })}
      {parties.map((p) => {
        const isSelected = selectedSlugs.has(p.slug);
        return (
          <button
            key={p.slug}
            onClick={() => onToggleFilter(p.slug)}
            className={`shrink-0 size-10 rounded-full flex items-center justify-center transition-all ${
              isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "opacity-70"
            }`}
            style={{
              backgroundColor: p.color ? `${p.color}20` : "#e5e7eb",
            }}
            aria-label={`Filtrer par ${p.shortName || p.name}`}
            aria-pressed={isSelected}
            title={p.shortName || p.name}
          >
            <Building2 className="size-5" style={{ color: p.color || "#6b7280" }} />
          </button>
        );
      })}
    </div>
  );
}
