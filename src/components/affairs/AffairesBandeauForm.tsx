import Form from "next/form";
import { Search } from "lucide-react";
import type { AffairesFilterOption } from "./affaires-filter-options";

const FIELD =
  "min-h-11 w-full rounded-lg bg-white px-3 text-base text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/**
 * Search and filters of the /affaires landing banner. A GET form on the listing itself, with the
 * filter bar's parameter names, labels and options: submitting lands on the same page, filtered.
 */
export function AffairesBandeauForm({
  selects,
}: {
  selects: { name: string; label: string; options: AffairesFilterOption[] }[];
}) {
  return (
    <Form action="/affaires" role="search" className="w-full space-y-4">
      <div>
        <label htmlFor="affaires-search" className="mb-2 block text-sm font-bold text-white">
          Recherche
        </label>
        <div className="flex items-stretch gap-2 rounded-xl bg-white p-1.5">
          <input
            id="affaires-search"
            name="search"
            type="search"
            maxLength={100}
            autoComplete="off"
            placeholder="Nom, mot-clé"
            className="min-h-11 min-w-0 flex-1 rounded-lg bg-transparent px-3 text-base text-neutral-900 placeholder:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
          <button
            type="submit"
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-primary px-3 font-bold text-primary-foreground hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:px-5"
          >
            <Search className="h-5 w-5 sm:hidden" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Rechercher</span>
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {selects.map(({ name, label, options }) => (
          <div key={name} className="min-w-0">
            <label htmlFor={`affaires-${name}`} className="mb-1 block text-sm font-bold text-white">
              {label}
            </label>
            <select id={`affaires-${name}`} name={name} defaultValue="" className={FIELD}>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </Form>
  );
}
