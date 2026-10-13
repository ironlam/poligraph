import Link from "next/link";
import type { RegionTerritoire } from "@/lib/data/territoires";
import { TERRITOIRES_PATH, territoireDepartementPath } from "@/lib/territoires/paths";
import { cn, formatDate } from "@/lib/utils";
import {
  BandeauFilAriane,
  BandeauSurtitre,
  RubriqueBandeau,
} from "@/components/ui/RubriqueBandeau";
import { TerritoryShape } from "./TerritoryShape";
import { formatCompte, formatNombre } from "@/lib/territoires/format";

function Fait({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-xl border border-white/25 bg-white/5 px-4 py-3", className)}>
      <dt className="text-sm text-white/80">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

export function RegionHero({ data }: { data: RegionTerritoire }) {
  const { region, presidence, communeCount, departements } = data;
  const departementPathByCode = new Map(
    departements.flatMap((d) =>
      d.slug ? [[d.code, territoireDepartementPath(d.slug)] as const] : []
    )
  );
  const presidenceDate = presidence.lastConfirmedAt ? formatDate(presidence.lastConfirmedAt) : null;

  return (
    <RubriqueBandeau labelledBy="region-titre">
      <BandeauFilAriane
        items={[{ label: "Territoires", href: TERRITOIRES_PATH }, { label: region.name }]}
      />
      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <BandeauSurtitre>
            Région · {formatCompte(departements.length, "département", "départements")}
          </BandeauSurtitre>
          <h1
            id="region-titre"
            className="mt-3 font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl"
          >
            {region.name}
          </h1>
          <p className="mt-2 text-white/85">Chef-lieu : {region.chefLieu.name}</p>
        </div>
        <div className="w-24 shrink-0 sm:w-40 lg:w-56">
          {/* Decorative mouse shortcut with the department name on hover; the list is below. */}
          <TerritoryShape
            kind="region"
            region={region.name}
            tone="marine"
            departementHref={(code) => departementPathByCode.get(code)}
          />
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Fait label="Départements">
          <span className="font-display text-xl font-bold">{departements.length}</span>
        </Fait>
        <Fait label="Communes">
          <span className="font-display text-xl font-bold">{formatNombre(communeCount)}</span>
        </Fait>
        <Fait label="Présidence" className="col-span-2 sm:col-span-1">
          {presidence.state === "ETABLI" && presidence.person ? (
            <>
              <Link
                href={`/politiques/${presidence.person.slug}`}
                prefetch={false}
                className="inline-flex min-h-11 items-center font-display text-lg font-bold underline underline-offset-4"
              >
                {presidence.person.fullName}
              </Link>
              {presidence.title && (
                <span className="block text-sm text-white/80">{presidence.title}</span>
              )}
              {(presidence.source || presidenceDate) && (
                <span className="mt-1 block text-xs text-white/80">
                  {presidence.source ? `Source : ${presidence.source.label}` : null}
                  {presidence.source && presidenceDate ? " · " : null}
                  {presidenceDate ? `confirmée le ${presidenceDate}` : null}
                </span>
              )}
            </>
          ) : presidence.registre ? (
            <>
              <span className="font-display text-lg font-bold">{presidence.registre.fullName}</span>
              <span className="mt-1 block text-xs text-white/80">
                D{"'"}après le registre national des élus
                {presidenceDate ? `, publié le ${presidenceDate}` : ""}
              </span>
            </>
          ) : (
            <span className="font-medium">Présidence non établie dans nos données</span>
          )}
        </Fait>
      </dl>
    </RubriqueBandeau>
  );
}
