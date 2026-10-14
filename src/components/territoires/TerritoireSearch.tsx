import { Search } from "lucide-react";
import { TERRITOIRES_SEARCH_PATH } from "@/lib/territoires/paths";
import { cn } from "@/lib/utils";

/**
 * Territory search form. A plain GET form: it works without JavaScript, the results page is
 * rendered on the server from the query string.
 */
export function TerritoireSearch({
  defaultValue = "",
  tone = "marine",
  id = "territoire-q",
}: {
  defaultValue?: string;
  /** `marine`: on the navy banner. `clair`: on the page background. */
  tone?: "marine" | "clair";
  id?: string;
}) {
  const hintId = `${id}-aide`;
  return (
    <form role="search" action={TERRITOIRES_SEARCH_PATH} method="get" className="w-full">
      <label
        htmlFor={id}
        className={cn("mb-2 block text-sm font-bold", tone === "marine" ? "text-white" : "")}
      >
        Rechercher un territoire
      </label>
      <div
        className={cn(
          "flex items-stretch gap-2 rounded-xl p-1.5",
          tone === "marine" ? "bg-white" : "border border-border bg-card"
        )}
      >
        <input
          id={id}
          name="q"
          type="search"
          required
          minLength={2}
          maxLength={80}
          autoComplete="off"
          defaultValue={defaultValue}
          placeholder="Commune, département, région ou code postal"
          aria-describedby={hintId}
          className={cn(
            "min-h-11 min-w-0 flex-1 rounded-lg bg-transparent px-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
            tone === "marine"
              ? "text-neutral-900 placeholder:text-neutral-600"
              : "text-foreground placeholder:text-muted-foreground"
          )}
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
      <p
        id={hintId}
        className={cn(
          "mt-2 text-sm",
          tone === "marine" ? "text-white/80" : "text-muted-foreground"
        )}
      >
        Commune, code postal, département ou région.
      </p>
    </form>
  );
}
