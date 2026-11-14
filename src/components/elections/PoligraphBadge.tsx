import { Badge } from "@/components/ui/badge";

/**
 * "Fiche PoliGraph" badge — shown on candidate/mayor cards
 * when we have a linked politician profile with cross-referenced data.
 */
export function PoligraphBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={className ?? "shrink-0 text-xs"}
      title="Fiche avec toutes les informations croisées du représentant"
    >
      Fiche PoliGraph
    </Badge>
  );
}
