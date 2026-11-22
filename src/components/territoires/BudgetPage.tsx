import Link from "next/link";
import { ComptesSerie } from "@/components/territoires/ComptesSerie";
import type { RepereTerritoryKind } from "@/config/territoire-reperes";
import type { ComptesTerritoire } from "@/lib/data/territoire-comptes";
import { communeSeuleLigne, comptesPhrase } from "@/lib/territoires/comptes-phrase";

const ECHELLE: Record<RepereTerritoryKind, string> = {
  COM: "commune",
  DEP: "département",
  REG: "région",
};

/** Body of the three /budget sub-pages: back link, title, answer sentence, series. */
export function BudgetPage({
  retour,
  titre,
  comptes,
  scale,
  intercommunalites = [],
}: {
  retour: { label: string; href: string };
  titre: string;
  comptes: ComptesTerritoire;
  scale: RepereTerritoryKind;
  /** Commune scale only: names of the intercommunalities it belongs to. */
  intercommunalites?: readonly string[];
}) {
  const phrase = comptesPhrase(comptes, scale);
  const seule = scale === "COM" ? communeSeuleLigne(intercommunalites) : null;
  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 md:py-8">
      <nav aria-label="Fil d'Ariane" className="text-sm">
        <Link
          href={retour.href}
          prefetch={false}
          className="inline-flex min-h-11 items-center underline underline-offset-2"
        >
          {retour.label}
        </Link>
      </nav>
      <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight md:text-3xl">
        {titre}
      </h1>
      {phrase && <p className="mt-3 text-base">{phrase}</p>}
      {seule && <p className="mt-3 text-sm">{seule}</p>}
      <div className="mt-6">
        <ComptesSerie comptes={comptes} territoire={`${retour.label} (${ECHELLE[scale]})`} />
      </div>
    </div>
  );
}
