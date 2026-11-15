import type { ExecutifRang } from "@/lib/territoires/executif";

/** Lines shown before the rest is folded. */
const VISIBLE = 5;

function Rangs({ rangs }: { rangs: ExecutifRang[] }) {
  return (
    <ol className="divide-y divide-border text-sm">
      {rangs.map((r) => (
        <li key={`${r.rang}-${r.nom}`} className="flex gap-3 py-1.5">
          <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">
            <span className="sr-only">Rang </span>
            {r.rang}
          </span>
          <span className="font-medium">{r.nom}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Ranked deputies of an executive as the RNE lists them: rank and name only, no delegation (the
 * register has none) and no link to a profile (it does not identify a person across files).
 * The source line is the one of the council block this sits in.
 */
export function Executif({ titre, rangs }: { titre: string; rangs: ExecutifRang[] }) {
  if (rangs.length === 0) return null;
  const suite = rangs.slice(VISIBLE);
  return (
    <div>
      <h3 className="text-sm font-semibold">{titre}</h3>
      <p className="text-xs text-muted-foreground">Par rang, selon le registre.</p>
      <div className="mt-1">
        <Rangs rangs={rangs.slice(0, VISIBLE)} />
        {suite.length > 0 && (
          <details className="mt-2 rounded-xl border">
            <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold">
              {suite.length > 1 ? `Voir les ${suite.length} suivants` : "Voir le suivant"}
            </summary>
            <div className="border-t px-4 py-1">
              <Rangs rangs={suite} />
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
