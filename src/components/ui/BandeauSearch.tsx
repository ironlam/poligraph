import { Search } from "lucide-react";

/**
 * Search field of a section landing banner, on the navy background. A plain GET form like
 * TerritoireSearch: it works without JavaScript and lands on the filtered listing.
 */
export function BandeauSearch({
  action,
  id,
  label,
  placeholder,
  name = "search",
}: {
  action: string;
  id: string;
  label: string;
  placeholder: string;
  name?: string;
}) {
  return (
    <form role="search" action={action} method="get" className="w-full">
      <label htmlFor={id} className="mb-2 block text-sm font-bold text-white">
        {label}
      </label>
      <div className="flex items-stretch gap-2 rounded-xl bg-white p-1.5">
        <input
          id={id}
          name={name}
          type="search"
          required
          minLength={2}
          maxLength={100}
          autoComplete="off"
          placeholder={placeholder}
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
    </form>
  );
}
