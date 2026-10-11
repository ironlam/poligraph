import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { TerritoireSearchResult } from "@/lib/data/territoires";
import {
  territoireCommunePath,
  territoireRegionPath,
  territoireDepartementPath,
} from "@/lib/territoires/paths";
import { formatCompte } from "@/lib/territoires/format";

const POSTAL_CODE = /^\d{5}$/;

type CommuneHit = TerritoireSearchResult["communes"][number];

function departmentLabel(c: CommuneHit): string {
  return c.department.name ? `${c.department.name} (${c.department.code})` : c.department.code;
}

function ResultRow({
  href,
  title,
  detail,
}: {
  href: string;
  title: string;
  detail?: string | null;
}) {
  return (
    <li className="border-t border-border first:border-t-0">
      <Link
        href={href}
        prefetch={false}
        className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      >
        <span className="min-w-0">
          <span className="font-bold">{title}</span>
          {detail && <span className="text-muted-foreground"> · {detail}</span>}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}

function Group({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="border-b border-border px-4 py-3">
        <h2 id={id} className="font-display text-lg font-extrabold">
          {title}
        </h2>
        {intro && <p className="mt-1 text-sm">{intro}</p>}
      </div>
      <ul>{children}</ul>
    </section>
  );
}

/**
 * Results of a territory search, grouped by kind. A postal code shared by several communes lists
 * all of them: the reader picks theirs, nothing is chosen for them.
 */
export function TerritoireSearchResults({
  query,
  result,
}: {
  query: string;
  result: TerritoireSearchResult;
}) {
  const { communes, departements, regions } = result;
  const isPostal = POSTAL_CODE.test(query);
  const byPostal = isPostal ? communes.filter((c) => c.postalCodes.includes(query)) : [];
  const others = isPostal ? communes.filter((c) => !c.postalCodes.includes(query)) : communes;
  const reachableDepartements = departements.filter(
    (d): d is typeof d & { slug: string } => d.slug !== null
  );
  const total = communes.length + reachableDepartements.length + regions.length;

  if (total === 0) {
    return (
      <div role="status" className="rounded-xl border border-border bg-card p-4">
        <p className="font-bold">Aucun territoire ne correspond à « {query} ».</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Essayez le nom complet de la commune, son code postal à cinq chiffres ou le nom du
          département.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p role="status" className="sr-only">
        {formatCompte(total, "résultat", "résultats")} pour « {query} ».
      </p>

      {byPostal.length > 0 && (
        <Group
          id="resultats-code-postal"
          title={`Code postal ${query}`}
          intro={
            byPostal.length > 1 ? (
              <>
                Le code postal {query} correspond à{" "}
                <strong>{formatCompte(byPostal.length, "commune", "communes")}</strong>. Choisissez
                la vôtre.
              </>
            ) : (
              <>Le code postal {query} correspond à une seule commune.</>
            )
          }
        >
          {byPostal.map((c) => (
            <ResultRow
              key={c.inseeCode}
              href={territoireCommunePath(c.inseeCode)}
              title={c.name}
              detail={departmentLabel(c)}
            />
          ))}
        </Group>
      )}

      {others.length > 0 && (
        <Group id="resultats-communes" title={isPostal ? "Code INSEE" : "Communes"}>
          {others.map((c) => (
            <ResultRow
              key={c.inseeCode}
              href={territoireCommunePath(c.inseeCode)}
              title={c.name}
              detail={departmentLabel(c)}
            />
          ))}
        </Group>
      )}

      {reachableDepartements.length > 0 && (
        <Group id="resultats-departements" title="Départements">
          {reachableDepartements.map((d) => (
            <ResultRow
              key={d.code}
              href={territoireDepartementPath(d.slug)}
              title={d.name ?? d.code}
              detail={d.code}
            />
          ))}
        </Group>
      )}

      {regions.length > 0 && (
        <Group id="resultats-regions" title="Régions">
          {regions.map((r) => (
            <ResultRow key={r.code} href={territoireRegionPath(r.slug)} title={r.name} />
          ))}
        </Group>
      )}
    </div>
  );
}
