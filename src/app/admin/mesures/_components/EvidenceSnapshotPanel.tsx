import { readEvidenceSnapshot } from "@/lib/measures/evidence-snapshot";

function pageLabel(page: number | null): string {
  return page === null ? "page non déterminée" : `page ${page}`;
}

function EvidenceUnits({
  title,
  units,
}: {
  title: string;
  units: Array<{
    unitId: string;
    page: number | null;
    rawExactText: string;
    speaker: string;
    discourseRole: string;
  }>;
}) {
  return (
    <div>
      <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h5>
      {units.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">Aucune unité.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {units.map((unit) => (
            <li key={unit.unitId} className="rounded border border-border bg-muted/30 p-3">
              <blockquote className="text-sm whitespace-pre-wrap">{unit.rawExactText}</blockquote>
              <p className="mt-2 text-xs text-muted-foreground">
                {pageLabel(unit.page)} · {unit.speaker} · {unit.discourseRole}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EvidenceSnapshotPanel({
  formulation,
  classification,
  snapshotValue,
  documentLabel,
}: {
  formulation: string;
  classification: "MEASURE" | "OBJECTIVE";
  snapshotValue: unknown;
  documentLabel: string | null;
}) {
  const result = readEvidenceSnapshot(snapshotValue);

  return (
    <section aria-label="Preuve de la révision" className="mt-3 space-y-4">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ce que PoliGraph propose
        </h4>
        <p className="mt-1 text-sm">{formulation}</p>
        <p className="mt-1 text-xs font-medium text-muted-foreground">
          Classification proposée : {classification}
        </p>
      </div>

      {result.status === "ABSENT" && (
        <p className="rounded border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          Aucune preuve V6 persistée. Cette révision peut être historique, manuelle ou issue du
          pipeline V5.
        </p>
      )}

      {result.status === "INVALID" && (
        <div
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
        >
          <p className="font-medium">Snapshot présent mais invalide.</p>
          <p className="mt-1">
            Il n&apos;est pas présenté comme une preuve valide. {result.reason}
          </p>
        </div>
      )}

      {result.status === "VALID" && (
        <>
          <div>
            <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pourquoi
            </h5>
            <p className="mt-1 text-sm">
              Attribution retenue :{" "}
              <span className="font-medium">{result.snapshot.attributionBasis}</span>
            </p>
          </div>

          <div>
            <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Source
            </h5>
            <p className="mt-1 text-sm">
              {documentLabel ?? `Édition ${result.snapshot.programEditionId}`} · pages{" "}
              {result.snapshot.pages.join(", ")}
            </p>
            <a
              href={result.snapshot.documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Ouvrir le document source officiel dans un nouvel onglet"
              className="mt-1 inline-block text-sm text-primary underline break-all"
            >
              Ouvrir le document officiel
            </a>
          </div>

          <EvidenceUnits
            title="Engagement"
            units={result.snapshot.units.filter((unit) => unit.role === "COMMITMENT_ANCHOR")}
          />

          <EvidenceUnits
            title="Contexte"
            units={result.snapshot.units.filter((unit) => unit.role === "SUPPORTING_CONTEXT")}
          />

          <details className="rounded border border-border p-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">
              Provenance technique
            </summary>
            <dl className="mt-2 grid gap-1 sm:grid-cols-2">
              <div>
                <dt className="font-medium">Schéma</dt>
                <dd>{result.snapshot.schemaVersion}</dd>
              </div>
              <div>
                <dt className="font-medium">Parser</dt>
                <dd>{result.snapshot.parserVersion}</dd>
              </div>
              <div>
                <dt className="font-medium">Discourse extractor</dt>
                <dd>{result.snapshot.discourseExtractorVersion}</dd>
              </div>
              <div>
                <dt className="font-medium">Measure extractor</dt>
                <dd>{result.snapshot.measureExtractorVersion}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-medium">Hash du document</dt>
                <dd className="break-all font-mono">{result.snapshot.documentHash}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-medium">Hash du bundle</dt>
                <dd className="break-all font-mono">{result.snapshot.canonicalEvidenceHash}</dd>
              </div>
            </dl>
          </details>
        </>
      )}
    </section>
  );
}
