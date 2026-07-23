import type { DeclarationDetails } from "@/types/hatvp";
import { formatEuroExact } from "@/lib/declarations/hatvp-display";

export type HistoryDeclaration = { id: string; year: number; details: DeclarationDetails | null };

type StateKind = "value" | "none" | "unknown" | "unavailable";

// The model distinguishes "no usable evaluation" (totalPortfolioValue === null)
// from a real zero sum. We never say "non déclaré" when the model can't tell.
export function declarationHistoryState(details: DeclarationDetails | null): {
  kind: StateKind;
  text: string;
} {
  if (!details) return { kind: "unavailable", text: "Donnée indisponible" };
  const parts = details.financialParticipations ?? [];
  if (parts.length === 0) return { kind: "none", text: "Aucune participation financière déclarée" };
  if (details.totalPortfolioValue === null)
    return { kind: "unknown", text: "Montant non renseigné" };
  return { kind: "value", text: formatEuroExact(details.totalPortfolioValue) };
}

export function DeclarationHistory({ declarations }: { declarations: HistoryDeclaration[] }) {
  if (declarations.length === 0) return null;
  const rows = [...declarations].sort((a, b) => b.year - a.year);
  return (
    <div>
      <h3 className="font-display text-sm font-semibold mb-3">
        Historique des participations financières déclarées
      </h3>
      <ul className="divide-y">
        {rows.map((d) => {
          const state = declarationHistoryState(d.details);
          return (
            <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <span className="font-mono text-muted-foreground">{d.year}</span>
                <span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
                  DIA
                </span>
              </span>
              <span
                className={
                  state.kind === "value" ? "font-display font-semibold" : "text-muted-foreground"
                }
              >
                {state.text}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
