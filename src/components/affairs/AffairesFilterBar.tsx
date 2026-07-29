"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { SlidersHorizontal, X } from "lucide-react";
import { useFilterParams } from "@/hooks/useFilterParams";
import { ToggleGroup, type ToggleGroupOption } from "@/components/ui/ToggleGroup";
import {
  DebouncedSearchInput,
  SelectFilter,
  ActiveFilterChips,
  FilterBarShell,
  type ActiveFilter,
} from "@/components/filters";
import { AffairModeToggle } from "@/components/affairs/AffairModeToggle";
import {
  AFFAIR_CATEGORY_LABELS,
  AFFAIR_SUPER_CATEGORY_LABELS,
  CATEGORY_TO_SUPER,
  getCategoriesForSuper,
  type AffairSuperCategory,
} from "@/config/labels";
import { CERTAINTY_LABELS, CERTAINTY_SORT_ORDER, type CertaintyLevel } from "@/config/certainty";
import type { AffairCategory } from "@/types";
import { cn } from "@/lib/utils";

type AffairMode = "mise-en-cause" | "victime";

interface AffairesFilterBarProps {
  mode: AffairMode;
  currentFilters: {
    search: string;
    sort: string;
    certainty: string;
    parti: string;
    category: string;
    supercat: string;
  };
  parties: Array<{
    slug: string;
    shortName: string;
    name: string;
    count: number;
  }>;
  certaintyCounts: Record<string, number>;
  superCounts: Record<string, number>;
}

const SORT_OPTIONS: Record<string, string> = {
  "": "Plus récentes",
  certainty: "Par certitude",
  "date-asc": "Plus anciennes",
  "name-asc": "Nom A-Z",
  "name-desc": "Nom Z-A",
};

const SUPER_CATEGORIES: AffairSuperCategory[] = [
  "PROBITE",
  "FINANCES",
  "PERSONNES",
  "EXPRESSION",
  "AUTRE",
];

const CERTAINTY_LEVELS_ORDERED = (Object.keys(CERTAINTY_LABELS) as CertaintyLevel[]).sort(
  (a, b) => CERTAINTY_SORT_ORDER[a] - CERTAINTY_SORT_ORDER[b]
);

// Dot colour family per level, mirroring CERTAINTY_COLORS. Supplementary only:
// the text label + count remain the primary signal (never colour-alone).
const CERTAINTY_DOT_COLORS: Record<CertaintyLevel, string> = {
  ETABLI: "bg-red-500",
  PRONONCE: "bg-orange-500",
  EN_COURS: "bg-amber-500",
  CLOS_SANS_CHARGE: "bg-slate-500",
  CLOS_FAVORABLE: "bg-gray-500",
};

function certaintyDot(level: CertaintyLevel) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", CERTAINTY_DOT_COLORS[level])}
    />
  );
}

export function AffairesFilterBar({
  mode,
  currentFilters,
  parties,
  certaintyCounts,
  superCounts,
}: AffairesFilterBarProps) {
  const { isPending, updateParams } = useFilterParams();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  // Utility filters use replace so they do not stack browser history.
  const set = (updates: Record<string, string>) => updateParams(updates, { mode: "replace" });

  // Category-first: the displayed family is the family of the selected
  // infraction when one is set. This keeps a legacy ?category= URL (no supercat)
  // coherent and never hides the active infraction.
  const effectiveSupercat = ((currentFilters.category
    ? CATEGORY_TO_SUPER[currentFilters.category as AffairCategory]
    : currentFilters.supercat) || "") as AffairSuperCategory | "";

  const certaintyOptions: ToggleGroupOption[] = [
    { value: "", label: "Toutes" },
    ...CERTAINTY_LEVELS_ORDERED.filter((level) => (certaintyCounts[level] ?? 0) > 0).map(
      (level) => ({
        value: level,
        label: `${CERTAINTY_LABELS[level]} (${certaintyCounts[level] ?? 0})`,
        icon: certaintyDot(level),
      })
    ),
  ];

  const superCatOptions: ToggleGroupOption[] = [
    { value: "", label: "Toutes" },
    ...SUPER_CATEGORIES.map((superCat) => ({
      value: superCat,
      label: `${AFFAIR_SUPER_CATEGORY_LABELS[superCat]} (${superCounts[superCat] ?? 0})`,
    })),
  ];

  // Infraction options are scoped to the effective family (no separators). The
  // select itself is only rendered once a family is active (see JSX below).
  const categoryOptions = effectiveSupercat
    ? [
        { value: "", label: "Toutes les infractions" },
        ...getCategoriesForSuper(effectiveSupercat).map((cat) => ({
          value: cat,
          label: AFFAIR_CATEGORY_LABELS[cat],
        })),
      ]
    : [];

  const partyOptions = [
    { value: "", label: "Tous les partis" },
    ...parties.map((p) => ({ value: p.slug, label: `${p.shortName} (${p.count})` })),
  ];

  const sortOptions = Object.entries(SORT_OPTIONS).map(([value, label]) => ({ value, label }));

  // Active filter chips. `mode` is a perimeter tab (not a chip); `sort` is a
  // display preference, not a filter, so it never becomes a chip (mirrors #484).
  const activeFilters: ActiveFilter[] = [];
  if (currentFilters.search) {
    activeFilters.push({ key: "search", label: `Recherche : ${currentFilters.search}` });
  }
  if (currentFilters.parti) {
    const party = parties.find((p) => p.slug === currentFilters.parti);
    activeFilters.push({
      key: "parti",
      label: `Parti : ${party?.shortName ?? currentFilters.parti}`,
    });
  }
  if (currentFilters.supercat) {
    // Suppress a stale family chip that would contradict the selected infraction
    // (incoherent ?supercat=A&category=B URL). Category prevails in the UI.
    const consistent =
      !currentFilters.category ||
      CATEGORY_TO_SUPER[currentFilters.category as AffairCategory] === currentFilters.supercat;
    if (consistent) {
      activeFilters.push({
        key: "supercat",
        label:
          AFFAIR_SUPER_CATEGORY_LABELS[currentFilters.supercat as AffairSuperCategory] ??
          currentFilters.supercat,
      });
    }
  }
  if (currentFilters.certainty) {
    activeFilters.push({
      key: "certainty",
      label:
        CERTAINTY_LABELS[currentFilters.certainty as CertaintyLevel] ?? currentFilters.certainty,
    });
  }
  if (currentFilters.category) {
    activeFilters.push({
      key: "category",
      label:
        AFFAIR_CATEGORY_LABELS[currentFilters.category as AffairCategory] ??
        currentFilters.category,
    });
  }

  const removeFilter = (key: string) =>
    key === "supercat" ? set({ supercat: "", category: "" }) : set({ [key]: "" });

  // Clears every filter EXCEPT sort, which is a display preference, not a
  // filter: it stays untouched, matching ActiveFilterChips (sort has no chip).
  const clearAll = () => set({ search: "", supercat: "", category: "", certainty: "", parti: "" });

  return (
    <FilterBarShell isPending={isPending} className="space-y-4">
      <AffairModeToggle mode={mode} />

      {/* Desktop / tablet layout */}
      <div className="hidden md:block space-y-4">
        <div className="overflow-x-auto pb-1">
          <ToggleGroup
            label="Certitude"
            value={currentFilters.certainty}
            options={certaintyOptions}
            onChange={(v) => set({ certainty: v })}
            className="flex-nowrap"
          />
        </div>

        <ToggleGroup
          label="Catégorie"
          value={effectiveSupercat}
          options={superCatOptions}
          onChange={(v) => set({ supercat: v, category: "" })}
          className="flex-wrap"
        />

        <div className="flex flex-wrap items-end gap-3">
          {effectiveSupercat && (
            <SelectFilter
              id="category-affairs"
              label="Infraction précise"
              value={currentFilters.category}
              onChange={(v) => set({ supercat: effectiveSupercat, category: v })}
              options={categoryOptions}
              className="min-w-[220px]"
            />
          )}
          <SelectFilter
            id="parti-affairs"
            label="Parti"
            value={currentFilters.parti}
            onChange={(v) => set({ parti: v })}
            options={partyOptions}
            className="min-w-[200px]"
          />
          <DebouncedSearchInput
            id="search-affairs"
            value={currentFilters.search}
            onSearch={(v) => set({ search: v })}
            manual
            placeholder="Rechercher une affaire..."
            label="Recherche"
            className="min-w-[260px] flex-1"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex-1">
            <ActiveFilterChips
              filters={activeFilters}
              onRemove={removeFilter}
              onClearAll={clearAll}
            />
          </div>
          <SelectFilter
            id="sort-affairs"
            label="Trier"
            value={currentFilters.sort}
            onChange={(v) => set({ sort: v })}
            options={sortOptions}
            className="min-w-[200px]"
          />
        </div>
      </div>

      {/* Mobile layout: "Filtres" bottom-sheet */}
      <div className="md:hidden space-y-3">
        <Dialog.Root open={sheetOpen} onOpenChange={setSheetOpen}>
          <Dialog.Trigger asChild>
            <button
              type="button"
              className="relative inline-flex min-h-11 items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Filtres
              {activeFilters.length > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground">
                  {activeFilters.length}
                </span>
              )}
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay
              className={cn(
                "fixed inset-0 z-50 bg-black/50",
                "data-[state=open]:animate-in data-[state=closed]:animate-out",
                "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
                "motion-reduce:animate-none"
              )}
            />
            <Dialog.Content
              className={cn(
                "fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-xl border-t bg-background p-4 shadow-2xl",
                "data-[state=open]:animate-in data-[state=closed]:animate-out",
                "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
                "motion-reduce:animate-none"
              )}
            >
              <div className="mb-4 flex items-center justify-between">
                <Dialog.Title className="text-base font-semibold">Filtres</Dialog.Title>
                <Dialog.Close
                  aria-label="Fermer"
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </Dialog.Close>
              </div>
              <Dialog.Description className="sr-only">
                Filtrer les affaires par certitude, catégorie, parti et recherche.
              </Dialog.Description>

              <div className="space-y-5">
                <AffairModeToggle mode={mode} />

                <div className="overflow-x-auto pb-1">
                  <ToggleGroup
                    label="Certitude"
                    value={currentFilters.certainty}
                    options={certaintyOptions}
                    onChange={(v) => set({ certainty: v })}
                    className="flex-nowrap"
                  />
                </div>

                <ToggleGroup
                  label="Catégorie"
                  value={effectiveSupercat}
                  options={superCatOptions}
                  onChange={(v) => set({ supercat: v, category: "" })}
                  className="flex-wrap"
                />

                {effectiveSupercat && (
                  <SelectFilter
                    id="category-affairs-sheet"
                    label="Infraction précise"
                    value={currentFilters.category}
                    onChange={(v) => set({ supercat: effectiveSupercat, category: v })}
                    options={categoryOptions}
                  />
                )}

                <SelectFilter
                  id="parti-affairs-sheet"
                  label="Parti"
                  value={currentFilters.parti}
                  onChange={(v) => set({ parti: v })}
                  options={partyOptions}
                />

                <SelectFilter
                  id="sort-affairs-sheet"
                  label="Trier"
                  value={currentFilters.sort}
                  onChange={(v) => set({ sort: v })}
                  options={sortOptions}
                />

                <DebouncedSearchInput
                  id="search-affairs-sheet"
                  value={currentFilters.search}
                  onSearch={(v) => set({ search: v })}
                  manual
                  placeholder="Rechercher une affaire..."
                  label="Recherche"
                />

                {activeFilters.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-sm text-primary hover:underline"
                  >
                    Tout effacer
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Appliquer
              </button>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <ActiveFilterChips filters={activeFilters} onRemove={removeFilter} onClearAll={clearAll} />
      </div>
    </FilterBarShell>
  );
}
