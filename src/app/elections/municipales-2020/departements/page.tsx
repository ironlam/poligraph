import { Metadata } from "next";
import { getDepartmentName } from "@/config/departments";
import { getDepartmentResults2020 } from "@/lib/data/elections";
import { Breadcrumb } from "@/components/ui/Breadcrumb";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Municipales 2020 par département",
  description: "Résultats des municipales 2020 par département : communes, listes et candidatures.",
  alternates: { canonical: "/elections/municipales-2020/departements" },
};

export default async function DepartmentsPage() {
  const departments = await getDepartmentResults2020();

  return (
    <>
      <main id="main-content" className="container mx-auto px-4 pt-4 pb-8 max-w-6xl">
        <Breadcrumb
          items={[
            { label: "Élections", href: "/elections" },
            { label: "Municipales 2020", href: "/elections/municipales-2020" },
            { label: "Départements" },
          ]}
        />
        <h1 className="text-2xl md:text-3xl font-display font-extrabold tracking-tight mb-2">
          Résultats par département
        </h1>
        <p className="text-muted-foreground mb-8">
          Municipales 2020 — Vue d{"'"}ensemble par département
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-3 pr-4 font-medium">Département</th>
                <th className="py-3 px-4 font-medium text-right">Communes</th>
                <th className="py-3 px-4 font-medium text-right">Listes</th>
                <th className="py-3 pl-4 font-medium text-right">Candidatures</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((dept) => (
                <tr
                  key={dept.departmentCode}
                  className="border-b hover:bg-muted/30 transition-colors"
                >
                  <td className="py-3 pr-4">
                    <span className="font-medium">
                      {getDepartmentName(dept.departmentCode) ?? dept.departmentCode}
                    </span>
                    <span className="text-muted-foreground ml-1">({dept.departmentCode})</span>
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums">
                    {dept.communeCount.toLocaleString("fr-FR")}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums">
                    {dept.listCount.toLocaleString("fr-FR")}
                  </td>
                  <td className="py-3 pl-4 text-right tabular-nums">
                    {dept.candidacyCount.toLocaleString("fr-FR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Sans cette légende, l'effondrement de la colonne Listes se lit comme une panne : sur un
            département rural elle passe de plusieurs milliers à quelques centaines. */}
        <div className="mt-6 space-y-2 text-sm text-muted-foreground">
          <p>
            Une liste n{"'"}existe que dans les communes de 1 000 habitants et plus. En dessous,
            chaque personne se présente seule : elle compte dans la colonne Candidatures, jamais
            dans la colonne Listes.
          </p>
          <p>
            La colonne Candidatures mélange deux unités héritées du fichier source : une ligne y
            vaut une personne dans les petites communes, et une liste entière dans les autres.
          </p>
          <p>
            Source : résultats officiels du ministère de l{"'"}Intérieur, élections municipales des
            15 mars et 28 juin 2020.
          </p>
        </div>
      </main>
    </>
  );
}
