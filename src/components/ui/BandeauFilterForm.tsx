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
        </div>
      </div>
      {/* The submit button comes after the filters it applies, so the tab order and the eye both end
          on it. Below sm the selects share one line that scrolls sideways, so the banner stays short
          enough to leave the first results on the first screen; the button sits under that line.
          `py-1` keeps the selects' focus outline unclipped. */}
      <div className="space-y-3 sm:flex sm:items-end sm:gap-3 sm:space-y-0">
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:min-w-0 sm:flex-1 sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:py-0 lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none">
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
        <button
          type="submit"
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-white px-5 font-bold text-neutral-900 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto sm:shrink-0"
        >
          <Search className="h-5 w-5" aria-hidden="true" />
          Rechercher
        </button>
      </div>
    </Form>
  );
}
