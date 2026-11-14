import Form from "next/form";
import { Search } from "lucide-react";

export interface BandeauFilterOption {
  value: string;
  label: string;
  disabled?: boolean;
}

const FIELD =
  "min-h-11 w-full rounded-lg bg-white px-3 text-base text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/**
 * Search and filters of a section landing banner, on the navy background. A GET form on the
 * listing itself, with the filter bar's parameter names, labels and options: submitting lands on
 * the same page, filtered.
 */
export function BandeauFilterForm({
  action,
  idPrefix,
  searchPlaceholder,
  selects,
}: {
  action: string;
  idPrefix: string;
  searchPlaceholder: string;
  selects: { name: string; label: string; options: BandeauFilterOption[] }[];
}) {
  return (
    <Form action={action} role="search" className="w-full space-y-4">
      <div>
        <label
          htmlFor={`${idPrefix}-search`}
          className="mb-2 block text-sm font-bold text-white max-sm:sr-only"
        >
          Recherche
        </label>
        <div className="flex items-stretch gap-2 rounded-xl bg-white p-1.5">
          <input
            id={`${idPrefix}-search`}
            name="search"
            type="search"
            aria-label="Recherche"
            maxLength={100}
            autoComplete="off"
            placeholder={searchPlaceholder}
            className="min-h-11 min-w-0 flex-1 rounded-lg bg-transparent px-3 text-base text-neutral-900 placeholder:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
          <button
            type="submit"
            aria-label="Rechercher"
            title="Rechercher"
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-primary px-3 font-bold text-primary-foreground hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:px-5"
          >
            <Search className="h-5 w-5 sm:hidden" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Rechercher</span>
          </button>
        </div>
      </div>
      {/* Below sm the selects share one line that scrolls sideways, so the banner stays short enough
          to leave the first results on the first screen. `py-1` keeps their focus outline unclipped. */}
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:overflow-visible sm:px-0 py-1 sm:grid sm:grid-cols-2 sm:py-0 lg:grid-cols-4">
        {selects.map(({ name, label, options }) => (
          <div
            key={name}
            className="w-44 min-w-0 shrink-0 sm:w-auto sm:last:odd:col-span-2 lg:last:odd:col-span-1"
          >
            <label
              htmlFor={`${idPrefix}-${name}`}
              className="mb-1 block text-sm font-bold text-white"
            >
              {label}
            </label>
            <select id={`${idPrefix}-${name}`} name={name} defaultValue="" className={FIELD}>
              {options.map((o) => (
                <option key={o.value || o.label} value={o.value} disabled={o.disabled}>
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
