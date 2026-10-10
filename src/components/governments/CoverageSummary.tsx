import type { PublishedGovernment } from "@/lib/governments/mapping";
import { formatDay, formatMonth, plural } from "./format";

/**
 * Scope, completeness and verification of the published governments, as three separate
 * statements (2a). Computed from the published set only.
 */
export function CoverageSummary({
  govs,
  coverage,
}: {
  govs: PublishedGovernment[];
  coverage: { from: string; to: string } | null;
}) {
  const partial = govs.filter((g) => g.completeness === "PARTIAL" || g.hiddenCount > 0).length;
  const checked = govs
    .map((g) => g.compositionCheckedAt)
    .filter((d): d is string => d !== null)
    .sort()
    .at(-1);

  const cells = [
    {
      title: "Périmètre",
      body: coverage
        ? `Périodes documentées : ${formatMonth(coverage.from)} à ${formatMonth(coverage.to)}. Les lacunes sont signalées gouvernement par gouvernement.`
        : "Aucune période documentée pour le moment.",
    },
    {
      title: "Complétude",
      body:
        partial > 0
          ? `Partielle : ${plural(partial, "gouvernement comporte", "gouvernements comportent")} des changements ou des personnes encore à documenter.`
          : "Complète pour les gouvernements publiés.",
    },
    {
      title: "Vérification",
      body: checked
        ? `Dernière vérification : ${formatDay(checked)}.`
        : "Date de vérification non renseignée.",
    },
  ];

  return (
    <div className="grid divide-y rounded-2xl border bg-card md:grid-cols-3 md:divide-x md:divide-y-0">
      {cells.map((cell) => (
        <div key={cell.title} className="px-5 py-4">
          <p className="text-[13px] font-bold">{cell.title}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{cell.body}</p>
        </div>
      ))}
    </div>
  );
}
