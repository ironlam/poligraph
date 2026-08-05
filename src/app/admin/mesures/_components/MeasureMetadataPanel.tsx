"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { QUALIFICATION_KIND_LABELS, SIMILARITY_CONCLUSION_LABELS } from "@/config/labels";
import type { QualificationKind, SimilarityConclusion } from "@/generated/prisma";
import {
  createQualificationAction,
  createSimilarityAssessmentAction,
  type ActionResult,
} from "../actions";

/**
 * Dated editorial conclusions on one formulation: qualifications and similarity assessments.
 *
 * Three properties the model demands and the interface has to honour:
 *
 * 1. **The revision is always explicit.** A conclusion belongs to the text it was drawn from, so the
 *    form makes the reviewer pick it rather than guessing at "the current one".
 * 2. **No edit in place.** Several dated conclusions on the same revision can be legitimate, so a
 *    second reading is a second row. Nothing here overwrites a previous one.
 * 3. **No version token.** These write child tables and leave `Measure.updatedAt` alone, so a token
 *    would protect nothing. Their preconditions are what protect them.
 */

const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50";
const FIELD = "mt-1 min-h-11 w-full rounded border border-border bg-background px-3 py-2 text-sm";
const LABEL = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

const KINDS = Object.keys(QUALIFICATION_KIND_LABELS) as QualificationKind[];
const CONCLUSIONS = Object.keys(SIMILARITY_CONCLUSION_LABELS) as SimilarityConclusion[];

export type MetadataRevisionOption = { id: string; text: string; validFrom: string };

function shorten(text: string): string {
  return text.length > 70 ? `${text.slice(0, 70)}…` : text;
}

export function MeasureMetadataPanel({
  measureId,
  revisions,
  defaultRevisionId,
}: {
  measureId: string;
  revisions: MetadataRevisionOption[];
  defaultRevisionId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<"qualification" | "similarity" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  function run(action: () => Promise<ActionResult>): void {
    setFailure(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setOpen(null);
        router.refresh();
        return;
      }
      setFailure(result.message);
    });
  }

  if (revisions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune révision à qualifier : une conclusion éditoriale porte sur un texte.
      </p>
    );
  }

  function revisionSelect(id: string): React.ReactElement {
    return (
      <div>
        <label htmlFor={id} className={LABEL}>
          Révision concernée
        </label>
        <select
          id={id}
          name="revisionId"
          required
          defaultValue={defaultRevisionId ?? ""}
          className={FIELD}
        >
          {revisions.map((revision) => (
            <option key={revision.id} value={revision.id}>
              {revision.validFrom} · {shorten(revision.text)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      {failure !== null && (
        <p
          role="alert"
          aria-live="polite"
          className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          {failure}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={pending}
          aria-expanded={open === "qualification"}
          onClick={() => setOpen(open === "qualification" ? null : "qualification")}
        >
          Ajouter une qualification
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={pending}
          aria-expanded={open === "similarity"}
          onClick={() => setOpen(open === "similarity" ? null : "similarity")}
        >
          Ajouter une évaluation de similarité
        </button>
      </div>

      {open === "qualification" && (
        <form
          className="space-y-3 rounded border border-border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const url = String(data.get("sourceUrl") ?? "").trim();
            const label = String(data.get("sourceLabel") ?? "").trim();
            run(() =>
              createQualificationAction({
                measureId,
                revisionId: String(data.get("revisionId")),
                kind: String(data.get("kind")) as QualificationKind,
                rationale: String(data.get("rationale") ?? ""),
                sourceUrl: url === "" ? null : url,
                sourceLabel: label === "" ? null : label,
              })
            );
          }}
        >
          {revisionSelect("qualification-revision")}

          <div>
            <label htmlFor="qualification-kind" className={LABEL}>
              Qualificatif
            </label>
            <select id="qualification-kind" name="kind" required className={FIELD}>
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {QUALIFICATION_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Les quatre définitions opposables sont dans docs/editorial/qualifications-mesures.md,
              avec le corpus à examiner pour chacune.
            </p>
          </div>

          <div>
            <label htmlFor="qualification-rationale" className={LABEL}>
              Justification
            </label>
            <textarea
              id="qualification-rationale"
              name="rationale"
              required
              rows={3}
              className={FIELD}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="qualification-url" className={LABEL}>
                URL de source (facultatif)
              </label>
              <input id="qualification-url" name="sourceUrl" type="url" className={FIELD} />
            </div>
            <div>
              <label htmlFor="qualification-label" className={LABEL}>
                Libellé de source (facultatif)
              </label>
              <input id="qualification-label" name="sourceLabel" type="text" className={FIELD} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Les deux champs de source vont ensemble : une URL sans libellé ne s&apos;affiche pas, un
            libellé sans URL ne se vérifie pas.
          </p>

          <button type="submit" className={BUTTON} disabled={pending}>
            Enregistrer la qualification
          </button>
        </form>
      )}

      {open === "similarity" && (
        <form
          className="space-y-3 rounded border border-border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const ids = String(data.get("equivalentRevisionIds") ?? "")
              .split(/[\s,]+/)
              .map((value) => value.trim())
              .filter((value) => value !== "");
            run(() =>
              createSimilarityAssessmentAction({
                measureId,
                revisionId: String(data.get("revisionId")),
                comparedCorpusVersion: String(data.get("comparedCorpusVersion") ?? ""),
                conclusion: String(data.get("conclusion")) as SimilarityConclusion,
                rationale: String(data.get("rationale") ?? ""),
                equivalentRevisionIds: ids,
              })
            );
          }}
        >
          {revisionSelect("similarity-revision")}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="similarity-conclusion" className={LABEL}>
                Conclusion
              </label>
              <select id="similarity-conclusion" name="conclusion" required className={FIELD}>
                {CONCLUSIONS.map((conclusion) => (
                  <option key={conclusion} value={conclusion}>
                    {SIMILARITY_CONCLUSION_LABELS[conclusion]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="similarity-corpus" className={LABEL}>
                Version du corpus comparé
              </label>
              <input
                id="similarity-corpus"
                name="comparedCorpusVersion"
                type="text"
                required
                placeholder="2027-01"
                className={FIELD}
              />
            </div>
          </div>

          <div>
            <label htmlFor="similarity-rationale" className={LABEL}>
              Justification
            </label>
            <textarea
              id="similarity-rationale"
              name="rationale"
              required
              rows={3}
              className={FIELD}
            />
          </div>

          <div>
            <label htmlFor="similarity-equivalents" className={LABEL}>
              Identifiants des révisions équivalentes
            </label>
            <input
              id="similarity-equivalents"
              name="equivalentRevisionIds"
              type="text"
              className={FIELD}
              placeholder="Séparés par des espaces ou des virgules"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Exigés par « Équivalent trouvé », interdits par les deux autres conclusions. Une
              recherche de révisions viendra plus tard : ici, les identifiants se collent à la main.
            </p>
          </div>

          <button type="submit" className={BUTTON} disabled={pending}>
            Enregistrer l&apos;évaluation
          </button>
        </form>
      )}
    </div>
  );
}
