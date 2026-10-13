import type { Metadata } from "next";
import Link from "next/link";
import { searchTerritoires } from "@/lib/data/territoires";
import {
  TERRITOIRES_PATH,
  TERRITOIRES_REGIONS_ANCHOR,
  TERRITOIRES_SEARCH_PATH,
} from "@/lib/territoires/paths";
import { BandeauFilAriane, RubriqueBandeau } from "@/components/ui/RubriqueBandeau";
import { TerritoireSearch } from "@/components/territoires/TerritoireSearch";
import { TerritoireSearchResults } from "@/components/territoires/TerritoireSearchResults";

/*
 * Dynamic on purpose: the answer depends on free text, which never reaches a cache key
 * (`searchTerritoires` is uncached and bounded). Rate-limited by the proxy ("search" tier), which
 * rewrites a limited request to `?limite=1` so the reader gets an HTML state, not JSON.
 */

export const metadata: Metadata = {
  title: "Rechercher une commune, un département ou une région",
  description:
    "Recherche d'une commune par nom ou code postal, d'un département ou d'une région, pour accéder à ses élus et aux résultats des élections.",
  robots: { index: false, follow: true },
  alternates: { canonical: TERRITOIRES_SEARCH_PATH },
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function TerritoiresRecherchePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; limite?: string | string[] }>;
}) {
  const params = await searchParams;
  const query = (first(params.q) ?? "").trim().slice(0, 80);
  const isRateLimited = first(params.limite) === "1";
  const result = !isRateLimited && query.length >= 2 ? await searchTerritoires(query) : null;

  return (
    <>
      <RubriqueBandeau labelledBy="recherche-titre">
        <BandeauFilAriane
          items={[{ label: "Territoires", href: TERRITOIRES_PATH }, { label: "Recherche" }]}
        />
        <h1
          id="recherche-titre"
          className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl"
        >
          {query && !isRateLimited ? `Résultats pour « ${query} »` : "Rechercher un territoire"}
        </h1>
        <div className="mt-5 max-w-xl">
          <TerritoireSearch defaultValue={query} />
        </div>
      </RubriqueBandeau>

      <div className="container mx-auto max-w-3xl px-4 py-8">
        {isRateLimited ? (
          <div role="alert" className="rounded-xl border border-border bg-card p-4">
            <p className="font-bold">Trop de recherches ont été lancées en peu de temps.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Réessayez dans une minute, ou parcourez les territoires{" "}
              <Link href={TERRITOIRES_REGIONS_ANCHOR} className="text-primary underline">
                par région
              </Link>
              .
            </p>
          </div>
        ) : result ? (
          <TerritoireSearchResults query={query} result={result} />
        ) : (
          <p className="text-muted-foreground">
            Saisissez au moins deux caractères : nom de commune, code postal, département ou région.
            Vous pouvez aussi parcourir les territoires{" "}
            <Link href={TERRITOIRES_REGIONS_ANCHOR} className="text-primary underline">
              par région
            </Link>
            .
          </p>
        )}
      </div>
    </>
  );
}
