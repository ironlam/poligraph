import type { ReactNode } from "react";
import { formatDate } from "@/lib/utils";

/**
 * SourceLine: attribution de source, sous le bloc qu'elle justifie.
 *
 * Implements docs/design/patterns/SourceAttribution.md. A factual claim without a
 * source is a content bug (invariant I6), so this is the primitive that makes the
 * claim checkable: which body the figure comes from, when we consulted it, and a way
 * to report an error.
 *
 * Two deliberate choices from the pattern doc. The consultation date stays discreet
 * but the body name does not fade to `--muted-foreground` in dark mode, otherwise the
 * only part that carries accountability becomes the least legible. And the line is
 * always visible: never behind a hover, never inside a collapsed "Sources (3)".
 */

export interface SourceRef {
  /** Name the body, not the pipeline: "Sénat", not "import senat v2". */
  label: string;
  /** Outbound link. Omitted when the source has no stable public URL. */
  url?: string;
}

interface SourceLineProps {
  sources: SourceRef[];
  /** When we read the source. Rendered as "Consulté le ...". */
  consultedAt?: Date | string | null;
  /** Short methodological note, when the figure needs one to be read correctly. */
  note?: ReactNode;
  /** Where to report an error. Defaults to the contact page. */
  reportHref?: string | null;
  className?: string;
}

function SourceItem({ source }: { source: SourceRef }) {
  if (!source.url) {
    return <span>{source.label}</span>;
  }
  const isExternal = /^https?:\/\//.test(source.url);
  if (!isExternal) {
    return (
      <a href={source.url} className="underline hover:text-primary">
        {source.label}
      </a>
    );
  }
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="underline hover:text-primary"
      aria-label={`${source.label} (nouvel onglet)`}
    >
      {source.label}
    </a>
  );
}

export function SourceLine({
  sources,
  consultedAt,
  note,
  reportHref = "/contact",
  className,
}: SourceLineProps) {
  const named = sources.filter((s) => s.label.trim().length > 0);

  return (
    <p className={`text-xs leading-relaxed text-muted-foreground ${className ?? ""}`.trim()}>
      {named.length > 0 && (
        <>
          <span className="font-medium text-muted-foreground-strong">
            {named.length > 1 ? "Sources" : "Source"} :{" "}
          </span>
          {named.map((source, index) => (
            <span key={`${source.label}-${index}`}>
              {index > 0 && <span aria-hidden="true"> · </span>}
              <SourceItem source={source} />
            </span>
          ))}
        </>
      )}
      {note && (
        <>
          {named.length > 0 && <span aria-hidden="true"> · </span>}
          <span>{note}</span>
        </>
      )}
      {consultedAt && (
        <>
          <span aria-hidden="true"> · </span>
          <span>Consulté le {formatDate(consultedAt)}</span>
        </>
      )}
      {reportHref && (
        <>
          <span aria-hidden="true"> · </span>
          <a href={reportHref} className="underline hover:text-primary">
            Signaler une erreur
          </a>
        </>
      )}
    </p>
  );
}
