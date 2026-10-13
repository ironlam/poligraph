import { REGIONS } from "@/config/regions";
import { territoireRegionPath } from "@/lib/territoires/paths";
import { BandeauSurtitre, RubriqueBandeau } from "@/components/ui/RubriqueBandeau";
import { TerritoireSearch } from "./TerritoireSearch";
import { TerritoryShape } from "./TerritoryShape";

const REGION_PATH_BY_NAME = new Map(REGIONS.map((r) => [r.name, territoireRegionPath(r.slug)]));

export function EntreeHero({ query = "" }: { query?: string }) {
  return (
    <RubriqueBandeau labelledBy="territoires-titre">
      <div className="flex items-center gap-10">
        <div className="min-w-0 max-w-3xl flex-1">
          <BandeauSurtitre>Territoires · communes, départements, régions</BandeauSurtitre>
          <h1
            id="territoires-titre"
            className="mt-4 font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl"
          >
            Les élus et les décisions de votre territoire
          </h1>
          <p className="mt-4 max-w-2xl text-base text-white/85 sm:text-lg">
            Commune, département, région : qui exerce quel mandat et les résultats des élections,
            avec la source officielle de chaque information.
          </p>
          <div className="mt-6 max-w-xl">
            <TerritoireSearch defaultValue={query} />
          </div>
        </div>
        {/* Decorative mouse shortcut: the region list below is the real navigation. */}
        <TerritoryShape
          kind="france"
          tone="marine"
          className="hidden w-[320px] shrink-0 lg:block"
          regionHref={(name) => REGION_PATH_BY_NAME.get(name)}
        />
      </div>
    </RubriqueBandeau>
  );
}
