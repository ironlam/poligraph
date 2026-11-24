import {
  siegesEnMots,
  type Composition,
  type PartConseil,
} from "@/lib/territoires/composition-conseil";

/** Three strengths of navy for the three largest lists, a neutral for the others. */
const TONS: Record<PartConseil["ton"], string> = {
  0: "bg-primary",
  1: "bg-primary/60",
  2: "bg-primary/30",
  autres: "bg-muted-foreground/30",
};

/**
 * Seats per list at the 2026 municipal election. The bar is decoration: the legend carries every
 * figure in words, and the reservation says what the picture is not (the council of today).
 * Its source is named once, on the source line of the block it sits in.
 */
export function CompositionConseil({ composition }: { composition: Composition }) {
  return (
    <section aria-labelledby="composition-conseil-titre">
      <h3 id="composition-conseil-titre" className="font-semibold">
        {siegesEnMots(composition.total)}, répartis à l{"'"}élection de 2026
      </h3>
      <div aria-hidden="true" className="mt-2 flex h-3 gap-0.5 overflow-hidden rounded-full">
        {composition.parts.map((part) => (
          <span key={part.label} className={TONS[part.ton]} style={{ flexGrow: part.sieges }} />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {composition.parts.map((part) => (
          <li key={part.label} className="flex items-start gap-2">
            <span
              aria-hidden="true"
              className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${TONS[part.ton]}`}
            />
            <span className="min-w-0 flex-1 break-words">{part.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">{siegesEnMots(part.sieges)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Sièges obtenus par chaque liste à l{"'"}élection. Cette répartition ne tient pas compte des
        démissions ni des remplacements survenus depuis, et ne dit rien de l{"'"}appartenance
        politique des élus.
      </p>
    </section>
  );
}
