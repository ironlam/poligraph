import { notFound } from "next/navigation";
import { getDepartmentBySlug } from "@/config/departments";
import { getDeputesByDepartment, getSenateursByDepartment } from "@/lib/data/departments";
import { getDepartementTerritoire } from "@/lib/data/territoires";
import type { CommuneListQuery } from "@/lib/territoires/departement-communes";
import { DepartementHero } from "@/components/territoires/DepartementHero";
import { CommuneIndex } from "@/components/territoires/CommuneIndex";
import { DepartementConseil } from "@/components/territoires/DepartementConseil";
import { DepartementParlement } from "@/components/territoires/DepartementParlement";

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

  const [territoire, deputies, senators] = await Promise.all([
    getDepartementTerritoire(dept.code, query),
    getDeputesByDepartment(dept.code),
    getSenateursByDepartment(dept.code),
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

  return (
    <div className="pb-10">
      <DepartementHero
        slug={slug}
        name={dept.name}
        code={dept.code}
        territoire={territoire}
        deputeCount={deputies.length}
        senateurCount={senators.length}
      />
      <div className="container mx-auto grid items-start gap-5 px-4 pt-5 sm:pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-5">
          <CommuneIndex slug={slug} territoire={territoire} />
          <DepartementConseil territoire={territoire} />
        </div>
        <DepartementParlement deputies={deputies} senators={senators} />
      </div>
    </div>
  );
}
