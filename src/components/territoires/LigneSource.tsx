import { cn } from "@/lib/utils";

export interface LigneSourceItem {
  label: string;
  url?: string | null;
}

/**
 * Source line of a Territoires block, always in the same form: period, producers, licence. One
 * per block, under it; the dated detail of each fact lives in « Sources de cette page ».
 */
export function LigneSource({
  sources,
  periode,
  licence,
  className,
}: {
  sources: (LigneSourceItem | null | undefined)[];
  periode?: string;
  licence?: string;
  className?: string;
}) {
  // The same producer often backs several facts of a block: it is named once.
  const unique = sources.filter(
    (s, i): s is LigneSourceItem => !!s && sources.findIndex((o) => o?.label === s.label) === i
  );
  if (unique.length === 0) return null;
  return (
    <p
      className={cn(
        // 12 px on every page: the Territoires reading scale shifts `text-xs`, not this line.
        "border-l-2 border-primary/20 pl-2 text-[0.75rem] leading-relaxed text-muted-foreground",
        className
      )}
    >
      {periode && `${periode} · `}
      {unique.length > 1 ? "Sources : " : "Source : "}
      {unique.map((source, i) => (
        <span key={source.label}>
          {i > 0 && " · "}
          {source.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-dotted underline-offset-2 hover:text-primary"
            >
              {source.label}
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
          ) : (
            source.label
          )}
        </span>
      ))}
      {licence && ` · ${licence}`}
    </p>
  );
}
