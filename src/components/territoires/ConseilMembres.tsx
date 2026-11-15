import type { ConseilBlock, ConseilMembreRef } from "@/lib/data/territoires";
import { formatDate } from "@/lib/utils";

function groupBySubdivision(membres: ConseilMembreRef[]) {
  const groups = new Map<string, ConseilMembreRef[]>();
  for (const m of membres) {
    const key = m.subdivisionLabel ?? "";
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "fr"));
}

function MembreLine({ m }: { m: ConseilMembreRef }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 py-1.5 text-sm">
      <span className="font-medium">
        {m.firstName} {m.lastName}
      </span>
      {m.functionLabel && <span className="text-muted-foreground">{m.functionLabel}</span>}
    </li>
  );
}

/**
 * Members of a council as listed by the RNE: name and function, no link to a profile (the register
 * does not identify a person across files). Grouped by canton or departmental section.
 */
export function ConseilMembres({
  conseil,
  groupLabel,
}: {
  conseil: ConseilBlock;
  /** Noun for the groups: "canton" or "section départementale". */
  groupLabel: string;
}) {
  if (conseil.state !== "DISPONIBLE") return null;
  const groups = groupBySubdivision(conseil.membres);
  const grouped = groups.length > 1;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        <strong>{conseil.recordedCount}</strong> {conseil.recordedCount > 1 ? "élus" : "élu"} en
        fonction selon le registre
        {conseil.registerDate ? ` du ${formatDate(conseil.registerDate)}` : ""}. Les sièges vacants
        n{"'"}y figurent pas.
      </p>
      <details className="rounded-xl border">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold">
          Voir les {conseil.recordedCount} membres
        </summary>
        <div className="border-t px-4 py-2">
          {grouped ? (
            groups.map(([label, list]) => (
              <section key={label || "sans"} className="py-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {label || `Sans ${groupLabel}`}
                </h3>
                <ul className="divide-y divide-border">
                  {list.map((m) => (
                    <MembreLine key={`${m.lastName}-${m.firstName}-${label}`} m={m} />
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <ul className="divide-y divide-border">
              {conseil.membres.map((m) => (
                <MembreLine key={`${m.lastName}-${m.firstName}`} m={m} />
              ))}
            </ul>
          )}
          {conseil.source && (
            <p className="mt-2 text-xs text-muted-foreground">
              Source :{" "}
              {conseil.source.url ? (
                <a
                  href={conseil.source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                  aria-label={`${conseil.source.label} (nouvel onglet)`}
                >
                  {conseil.source.label}
                </a>
              ) : (
                conseil.source.label
              )}
              . Liste nominative sans lien vers une fiche.
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
