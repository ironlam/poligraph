import { ParrainagesDepartement } from "@/components/parrainages/ParrainagesTerritoire";
import { getParrainagesDepartementResumes } from "@/lib/data/parrainages";
import { notFound } from "next/navigation";
import { getDepartmentBySlug } from "@/config/departments";
import { getDeputesByDepartment, getSenateursByDepartment } from "@/lib/data/departments";
import { getDepartementGrandesCommunes, getDepartementTerritoire } from "@/lib/data/territoires";
import type { CommuneListQuery } from "@/lib/territoires/departement-communes";
import { DepartementBandeau } from "@/components/territoires/DepartementBandeau";
import { TerritoireOnglets } from "@/components/territoires/TerritoireOnglets";
import { COMMUNES_ANCHOR } from "@/lib/territoires/departement-communes";
import { Agir } from "@/components/territoires/Agir";
import { FilTerritoire } from "@/components/territoires/FilTerritoire";
import { VotesParlementaires } from "@/components/territoires/VotesParlementaires";
import {
  getVotesDeputesDepartement,
  getVotesSenateursDepartement,
} from "@/lib/data/territoire-votes";
import { getFilTerritoire } from "@/lib/data/territoire-fil";
import { CommuneIndex } from "@/components/territoires/CommuneIndex";
import {
  DepartementConseil,
  remplaceLeDepartement,
} from "@/components/territoires/DepartementConseil";
import { DepartementParlement } from "@/components/territoires/DepartementParlement";
import { BudgetResume } from "@/components/territoires/BudgetResume";
import { getComptesTerritoire } from "@/lib/data/territoire-comptes";

/**
 * Body shared by `/territoires/departements/[slug]` and its commune-list variants
 * (`/territoires/departements/[slug]/communes/[lettre]/[page]`, reached through the proxy rewrite of
 * `?lettre=&page=`). Neither route reads searchParams.
 */
export async function DepartementPageBody({
  slug,
  query,
}: {
  slug: string;
  query: CommuneListQuery;
}) {
  const dept = getDepartmentBySlug(slug);
  if (!dept) notFound();

  // The bare page opens on the largest communes; the A to Z views list them all.
  const accueil = query.letter === null && query.page === 1;
  const [territoire, deputies, senators, grandes, votes, votesSenat, fil, parrainages, comptes] =
    await Promise.all([
      getDepartementTerritoire(dept.code, query),
      getDeputesByDepartment(dept.code),
      getSenateursByDepartment(dept.code),
      accueil ? getDepartementGrandesCommunes(dept.code) : [],
      getVotesDeputesDepartement(dept.code),
      getVotesSenateursDepartement(dept.code),
      getFilTerritoire("DEP", dept.code),
      getParrainagesDepartementResumes(dept.code),
      getComptesTerritoire("DEP", dept.code),
    ]);

  if (!territoire) notFound();
  if (deputies.length === 0 && senators.length === 0 && territoire.communeCount === 0) {
    notFound();
  }
  // A page past the end of the active filter is not a view of the list.
  if (query.page > territoire.communes.totalPages) notFound();

  // Sort deputies by constituency number
  deputies.sort((a, b) => {
    const numA = a.mandates[0]?.constituency?.match(/\((\d+)\)/)?.[1];
    const numB = b.mandates[0]?.constituency?.match(/\((\d+)\)/)?.[1];
    if (numA && numB) {
      return parseInt(numA) - parseInt(numB);
    }
    return 0;
  });

  // The first tab names the block `DepartementConseil` renders for this territory.
  const premier = territoire.territoireHorsRegion
    ? { href: "#statut", label: "Statut" }
    : remplaceLeDepartement(territoire.collectivitesParticulieres)
      ? { href: "#collectivite-competente", label: "Collectivité" }
      : { href: "#conseil", label: "Conseil" };

  // The block speaks of the conseil départemental: it is shown only where there is one.
  const agir = premier.href === "#conseil";

  return (
    <div className="pb-10">
      <DepartementBandeau
        slug={slug}
        name={dept.name}
        code={dept.code}
        territoire={territoire}
        deputeCount={deputies.length}
        senateurCount={senators.length}
      />
      <TerritoireOnglets
        onglets={[
          premier,
          { href: `#${COMMUNES_ANCHOR}`, label: "Communes" },
          { href: "#parlement", label: "Parlement" },
          ...(parrainages.length > 0 ? [{ href: "#parrainages", label: "Parrainages" }] : []),
          ...(agir ? [{ href: "#agir", label: "Agir" }] : []),
        ]}
      />
      <div className="container mx-auto grid max-w-6xl items-start gap-5 px-4 pt-5 sm:pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-5">
          <FilTerritoire evenements={fil} />
          <DepartementConseil territoire={territoire} />
          {/* Under the first tab: the accounts of the collectivity that holds the council. */}
          <BudgetResume comptes={comptes} scale="DEP" />
          <CommuneIndex slug={slug} territoire={territoire} grandes={grandes} />
          <VotesParlementaires votes={votes} mode={{ kind: "decompte" }} senat={votesSenat} />
          <ParrainagesDepartement resumes={parrainages} departmentSlug={slug} />
          {agir && <Agir niveau="departement" departmentCode={dept.code} />}
        </div>
        <DepartementParlement deputies={deputies} senators={senators} />
      </div>
    </div>
  );
}
