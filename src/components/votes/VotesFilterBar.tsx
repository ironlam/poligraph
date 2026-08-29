"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { SlidersHorizontal, X } from "lucide-react";
import { useFilterParams } from "@/hooks/useFilterParams";
import { ToggleGroup, type ToggleGroupOption } from "@/components/ui/ToggleGroup";
import {
  ActiveFilterChips,
  SelectFilter,
  FilterBarShell,
  type ActiveFilter,
} from "@/components/filters";
import { VotesSearchInput } from "@/components/votes/VotesSearchInput";
import { formatLegislature } from "@/lib/votes/legislature";
import {
  THEME_CATEGORY_LABELS,
  THEME_CATEGORY_ICONS,
  THEME_CATEGORY_COLORS,
  VOTING_RESULT_LABELS,
  CHAMBER_LABELS,
} from "@/config/labels";
import type { Chamber, ThemeCategory, VotingResult, ScrutinType } from "@/types";
import type { ScrutinSort } from "@/lib/data/scrutins";
import { LEGACY_THEME_CATEGORIES } from "@/lib/theme-utils";
import { cn } from "@/lib/utils";

// Fixed, stable order (declaration order of THEME_CATEGORY_LABELS): all 13
// always rendered, no "+9" truncation.
const THEME_CODES: readonly ThemeCategory[] = LEGACY_THEME_CATEGORIES;

const RESULT_OPTIONS: ToggleGroupOption[] = [
  { value: "", label: "Tous" },
  { value: "ADOPTED", label: VOTING_RESULT_LABELS.ADOPTED },
  { value: "REJECTED", label: VOTING_RESULT_LABELS.REJECTED },
];

const SORT_OPTIONS: ToggleGroupOption[] = [
  { value: "recent", label: "Récents" },
  { value: "close", label: "Serrés" },
  { value: "turnout", label: "Participation" },
];

export interface VotesFilterBarCurrent {
  chamber?: Chamber;
  result?: VotingResult;
  legislature?: number;
  theme?: ThemeCategory;
  /** Raw `?type=` URL value: undefined/"" -> vote d'ensemble (default), "amendements", "tous". */
  type?: string;
  search?: string;
  sort: ScrutinSort;
}

export interface VotesFilterBarOptions {
  chambers: { chamber: Chamber; _count: number }[];
  legislatures: { legislature: number; _count: number }[];
  themeCounts: { theme: ThemeCategory; _count: number }[];
  // getTypeCounts() groups by type without filtering nulls (scrutins with no
  // type), and those still count toward the "Tous" total, so keep the null bucket.
  typeCounts: { type: ScrutinType | null; _count: number }[];
}

export interface VotesFilterBarProps {
  current: VotesFilterBarCurrent;
  options: VotesFilterBarOptions;
}

function formatCount(count: number): string {
  return count.toLocaleString("fr-FR");
}

/**
 * Accessible radio grid/rail for the 13 theme categories. Not built on
 * ToggleGroup: 13 options is too many for a segmented strip, so this renders
 * as a wrapping grid (desktop/sheet) or a horizontally scrolling rail
 * (mobile quick-access), while keeping the same radiogroup semantics
 * (role, aria-checked, roving tabindex, arrow-key navigation, toggle-to-clear).
 */
function ThemeSelector({
  value,
  onChange,
  layout,
}: {
  value: ThemeCategory | "";
  onChange: (next: ThemeCategory | "") => void;
  layout: "grid" | "rail";
}) {
  const buttonRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = value ? THEME_CODES.indexOf(value) : -1;
  const rovingIndex = activeIndex >= 0 ? activeIndex : 0;

  function toggle(theme: ThemeCategory) {
    onChange(value === theme ? "" : theme);
  }

  function focusAt(index: number) {
    const length = THEME_CODES.length;
    const nextIndex = ((index % length) + length) % length;
    buttonRefs.current[nextIndex]?.focus();
    onChange(THEME_CODES[nextIndex]!);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case " ":
      case "Enter":
        event.preventDefault();
        toggle(THEME_CODES[index]!);
        break;
      default:
        break;
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Thème"
      className={cn(
        layout === "grid" && "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4",
        layout === "rail" && "flex gap-2 overflow-x-auto pb-1"
      )}
    >
      {THEME_CODES.map((theme, index) => {
        const selected = value === theme;
        return (
          <button
            key={theme}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={THEME_CATEGORY_LABELS[theme]}
            tabIndex={index === rovingIndex ? 0 : -1}
            onClick={() => toggle(theme)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 py-2 text-sm font-medium outline-none transition-colors motion-reduce:transition-none",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              layout === "rail" && "shrink-0",
              selected
                ? cn(THEME_CATEGORY_COLORS[theme], "border-2 font-semibold")
                : "border-border bg-background hover:bg-muted"
            )}
          >
            <span aria-hidden="true">{THEME_CATEGORY_ICONS[theme]}</span>
            <span>{THEME_CATEGORY_LABELS[theme]}</span>
          </button>
        );
      })}
    </div>
  );
}

export function VotesFilterBar({ current, options }: VotesFilterBarProps) {
  const { isPending, updateParams } = useFilterParams();
  const [sheetOpen, setSheetOpen] = React.useState(false);

  // Every control update uses "replace": no history entry, no scroll reset
  // (useFilterParams runs router.replace(..., { scroll: false }) in a
  // transition, and auto-resets `page`).
  const set = (updates: Record<string, string>) => updateParams(updates, { mode: "replace" });

  const hasMultipleChambers = options.chambers.length > 1;

  const chamberOptions: ToggleGroupOption[] = [
    { value: "", label: "Tout le Parlement" },
    ...options.chambers.map((c) => ({ value: c.chamber, label: CHAMBER_LABELS[c.chamber] })),
  ];

  const typeCountMap = new Map(options.typeCounts.map((t) => [t.type, t._count]));
  const amendementCount = typeCountMap.get("AMENDEMENT") ?? 0;
  const totalCount = options.typeCounts.reduce((sum, t) => sum + t._count, 0);
  const votesCount = totalCount - amendementCount;

  const porteeOptions: ToggleGroupOption[] = [
    {
      value: "tous",
      label: totalCount > 0 ? `Tous (${formatCount(totalCount)})` : "Tous",
      title: "Affiche tous les votes, y compris les amendements",
    },
    {
      value: "",
      label: votesCount > 0 ? `Vote d'ensemble (${formatCount(votesCount)})` : "Vote d'ensemble",
      title: "Adoption d'un texte entier",
    },
    {
      value: "amendements",
      label: amendementCount > 0 ? `Amendements (${formatCount(amendementCount)})` : "Amendements",
      title: "Vote sur un amendement précis",
    },
  ];
  const porteeValue = current.type === "amendements" || current.type === "tous" ? current.type : "";

  const legislatureOptions = options.legislatures.map((l) => ({
    value: String(l.legislature),
    label: formatLegislature(l.legislature),
  }));
  const legislatureValue = current.legislature ? String(current.legislature) : "";

  const activeFilters: ActiveFilter[] = [];
  if (current.chamber) {
    activeFilters.push({ key: "chamber", label: `Chambre : ${CHAMBER_LABELS[current.chamber]}` });
  }
  if (current.type === "amendements") {
    activeFilters.push({ key: "type", label: "Portée : Amendements" });
  } else if (current.type === "tous") {
    activeFilters.push({ key: "type", label: "Portée : Tous les votes" });
  }
  if (current.result) {
    activeFilters.push({
      key: "result",
      label: `Résultat : ${VOTING_RESULT_LABELS[current.result]}`,
    });
  }
  if (current.legislature) {
    activeFilters.push({
      key: "legislature",
      label: `Législature : ${formatLegislature(current.legislature)}`,
    });
  }
  if (current.theme) {
    activeFilters.push({ key: "theme", label: `Thème : ${THEME_CATEGORY_LABELS[current.theme]}` });
  }
  if (current.search) {
    activeFilters.push({ key: "search", label: `Recherche : "${current.search}"` });
  }

  const removeFilter = (key: string) => set({ [key]: "" });

  // Clears every filter EXCEPT sort, which is a display preference, not a
  // filter: it stays untouched, matching ActiveFilterChips (sort has no chip).
  const clearAll = () =>
    set({ chamber: "", type: "", result: "", legislature: "", theme: "", search: "" });

  const themeGroup = (layout: "grid" | "rail") => (
    <div>
      <p className="mb-2 text-sm font-medium text-muted-foreground">Thème</p>
      <ThemeSelector
        value={current.theme ?? ""}
        onChange={(v) => set({ theme: v })}
        layout={layout}
      />
    </div>
  );

  const controlGroups = (
    <>
      {hasMultipleChambers && (
        <ToggleGroup
          label="Chambre"
          value={current.chamber ?? ""}
          options={chamberOptions}
          onChange={(v) => set({ chamber: v })}
          className="flex-wrap"
        />
      )}
      <ToggleGroup
        label="Portée du vote"
        value={porteeValue}
        options={porteeOptions}
        onChange={(v) => set({ type: v })}
        className="flex-wrap"
      />
      <ToggleGroup
        label="Résultat"
        value={current.result ?? ""}
        options={RESULT_OPTIONS}
        onChange={(v) => set({ result: v })}
        className="flex-wrap"
      />
      <ToggleGroup
        label="Tri"
        value={current.sort}
        options={SORT_OPTIONS}
        onChange={(v) => set({ sort: v === "recent" ? "" : v })}
        className="flex-wrap"
      />
    </>
  );

  return (
    <FilterBarShell isPending={isPending} className="space-y-4">
      {/* Desktop / tablet layout */}
      <div className="hidden md:block space-y-4">
        {themeGroup("grid")}

        <div className="flex flex-wrap items-center gap-3">{controlGroups}</div>

        <div className="flex flex-wrap items-end gap-3">
          <SelectFilter
            id="votes-filter-legislature"
            label="Législature"
            value={legislatureValue}
            onChange={(v) => set({ legislature: v })}
            options={legislatureOptions}
            placeholder="Toutes les législatures"
            className="min-w-[220px]"
          />
          <VotesSearchInput value={current.search ?? ""} mode="replace" />
        </div>

        <ActiveFilterChips filters={activeFilters} onRemove={removeFilter} onClearAll={clearAll} />
      </div>

      {/* Mobile layout: quick-access theme rail + "Filtres" bottom-sheet */}
      <div className="md:hidden space-y-3">
        {themeGroup("rail")}

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
                Filtrer la liste des votes parlementaires par thème, chambre, portée, résultat,
                législature et recherche.
              </Dialog.Description>

              <div className="space-y-5">
                {themeGroup("grid")}

                <div className="flex flex-col gap-3">{controlGroups}</div>

                <SelectFilter
                  id="votes-filter-legislature-sheet"
                  label="Législature"
                  value={legislatureValue}
                  onChange={(v) => set({ legislature: v })}
                  options={legislatureOptions}
                  placeholder="Toutes les législatures"
                />

                <VotesSearchInput value={current.search ?? ""} mode="replace" />

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
