"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DOSSIER_STATUS_LABELS, THEME_CATEGORY_LABELS } from "@/config/labels";
import type { DossierStatus, ThemeCategory } from "@/generated/prisma";
import { LEGACY_THEME_CATEGORIES } from "@/lib/theme-utils";

const SORT_OPTIONS: Record<string, string> = {
  "": "Date de dépôt",
  updated: "Dernière mise à jour",
  status: "Par statut",
};

interface DossierFiltersProps {
  categories: { name: string; count: number }[];
}

export function DossierFilters({ categories }: DossierFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") || "");

  const updateParams = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page"); // Reset to page 1 on filter change
      router.push(`/admin/dossiers?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateParams("search", search || null);
  };

  const clearFilters = () => {
    setSearch("");
    router.push("/admin/dossiers");
  };

  const hasFilters =
    searchParams.has("status") ||
    searchParams.has("category") ||
    searchParams.has("theme") ||
    searchParams.has("search") ||
    searchParams.has("hasSummary") ||
    searchParams.has("sort");

  return (
    <div className="space-y-4 p-4 bg-white rounded-lg border">
      <div className="flex flex-wrap gap-4">
        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[200px]">
          <Input
            type="text"
            placeholder="Rechercher un dossier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
            aria-label="Rechercher un dossier"
          />
          <Button type="submit" variant="secondary">
            Rechercher
          </Button>
        </form>

        {/* Status filter */}
        <Select
          value={searchParams.get("status") || ""}
          onChange={(e) => updateParams("status", e.target.value || null)}
          className="w-[180px]"
          aria-label="Filtrer par statut"
        >
          <option value="">Tous les statuts</option>
          {(Object.keys(DOSSIER_STATUS_LABELS) as DossierStatus[]).map((status) => (
            <option key={status} value={status}>
              {DOSSIER_STATUS_LABELS[status]}
            </option>
          ))}
        </Select>

        {/* Category filter */}
        <Select
          value={searchParams.get("category") || ""}
          onChange={(e) => updateParams("category", e.target.value || null)}
          className="w-[180px]"
          aria-label="Filtrer par catégorie"
        >
          <option value="">Toutes catégories</option>
          {categories.map((cat) => (
            <option key={cat.name} value={cat.name}>
              {cat.name} ({cat.count})
            </option>
          ))}
        </Select>

        {/* Theme filter */}
        <Select
          value={searchParams.get("theme") || ""}
          onChange={(e) => updateParams("theme", e.target.value || null)}
          className="w-[200px]"
          aria-label="Filtrer par thème"
        >
          <option value="">Tous les thèmes</option>
          {(LEGACY_THEME_CATEGORIES as readonly ThemeCategory[]).map((theme) => (
            <option key={theme} value={theme}>
              {THEME_CATEGORY_LABELS[theme]}
            </option>
          ))}
        </Select>

        {/* Has summary filter */}
        <Select
          value={searchParams.get("hasSummary") || ""}
          onChange={(e) => updateParams("hasSummary", e.target.value || null)}
          className="w-[180px]"
          aria-label="Filtrer par résumé IA"
        >
          <option value="">Résumé IA</option>
          <option value="true">Avec résumé</option>
          <option value="false">Sans résumé</option>
        </Select>

        {/* Sort */}
        <Select
          value={searchParams.get("sort") || ""}
          onChange={(e) => updateParams("sort", e.target.value || null)}
          className="w-[180px]"
          aria-label="Trier par"
        >
          {Object.entries(SORT_OPTIONS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>

        {/* Clear filters */}
        {hasFilters && (
          <Button variant="ghost" onClick={clearFilters}>
            Effacer filtres
          </Button>
        )}
      </div>
    </div>
  );
}
