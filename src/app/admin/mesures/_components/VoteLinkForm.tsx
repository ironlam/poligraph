"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CHAMBER_LABELS,
  MEASURE_VOTE_LINK_KIND_LABELS,
  MEASURE_VOTE_RELATION_LABELS,
} from "@/config/labels";
import type { Chamber, MeasureVoteLinkKind, MeasureVoteRelation } from "@/generated/prisma";
import { attachVoteLinkAction, type ActionResult, type VoteLinkSituation } from "../actions";

/**
 * The manual attachment of a measure to a scrutin (spec §5.8).
 *
 * The one rule this form exists to make unbreakable: the reviewer must never file "no scrutin found" as
 * "the person was absent", nor the reverse. So the top-level choice is a single radio over three
 * mutually exclusive situations, and the fields that only make sense for one situation are rendered ONLY
 * for it:
 *
 * - NO_VOTE_IDENTIFIED: no scrutin, no relation. A dated constat that the documented perimeter held no
 *   relevant vote. Not an absence.
 * - SAME_OBJECT: a scrutin is chosen, and the reviewer records the candidate's relation to the measure,
 *   ABSENCE (did not take part) being one of the four values, alongside favorable/défavorable/abstention.
 * - BROADER_TEXT: a scrutin is chosen, but no position is attributable, so no relation field appears.
 *
 * A relation therefore cannot exist without a chosen scrutin, and ABSENCE is a relation on a scrutin, one
 * click away from "no scrutin found" but never the same control. `attachVoteLinkAction` and, beneath it,
 * `createMeasureVoteLink` re-check all of this: the form is the reviewer's guardrail, not the only one.
 */

const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50";
const FIELD = "mt-1 min-h-11 w-full rounded border border-border bg-background px-3 py-2 text-sm";
const LABEL = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";
const LEGEND = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

const SITUATION_KINDS = Object.keys(MEASURE_VOTE_LINK_KIND_LABELS) as MeasureVoteLinkKind[];
const RELATIONS = Object.keys(MEASURE_VOTE_RELATION_LABELS) as MeasureVoteRelation[];
const CHAMBERS = Object.keys(CHAMBER_LABELS) as Chamber[];

export type VoteLinkRevisionOption = { id: string; text: string; validFrom: string };

function shorten(text: string): string {
  return text.length > 70 ? `${text.slice(0, 70)}…` : text;
}

export function VoteLinkForm({
  measureId,
  revisions,
  defaultRevisionId,
}: {
  measureId: string;
  revisions: VoteLinkRevisionOption[];
  defaultRevisionId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [situation, setSituation] = useState<MeasureVoteLinkKind>("SAME_OBJECT");
  const [failure, setFailure] = useState<string | null>(null);

  function run(action: () => Promise<ActionResult>): void {
    setFailure(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setOpen(false);
        router.refresh();
        return;
      }
      setFailure(result.message);
    });
  }

  if (revisions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune révision à rattacher : un lien à un scrutin porte sur une formulation précise de la
        mesure.
      </p>
    );
  }

  function buildSituation(data: FormData): VoteLinkSituation | { error: string } {
    if (situation === "NO_VOTE_IDENTIFIED") {
      return { kind: "NO_VOTE_IDENTIFIED" };
    }
    const scrutinId = String(data.get("scrutinId") ?? "").trim();
    if (scrutinId === "") {
      return { error: "Renseignez l'identifiant du scrutin." };
    }
    if (situation === "BROADER_TEXT") {
      return { kind: "BROADER_TEXT", scrutinId };
    }
    const relation = String(data.get("relation") ?? "");
    if (!RELATIONS.includes(relation as MeasureVoteRelation)) {
      return { error: "Choisissez la relation du candidat à la mesure sur ce scrutin." };
    }
    return {
      kind: "SAME_OBJECT",
      scrutinId,
      relation: relation as MeasureVoteRelation,
      isReference: data.get("isReference") !== null,
    };
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

      <button
        type="button"
        className={BUTTON}
        disabled={pending}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Rattacher un scrutin
      </button>

      {open && (
        <form
          className="space-y-4 rounded border border-border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const built = buildSituation(data);
            if ("error" in built) {
              setFailure(built.error);
              return;
            }
            const chambers = data.getAll("institutionScope").map(String) as Chamber[];
            if (chambers.length === 0) {
              setFailure("Indiquez au moins une chambre examinée.");
              return;
            }
            const legislatures = String(data.get("legislatureScope") ?? "")
              .split(/[\s,]+/)
              .map((value) => value.trim())
              .filter((value) => value !== "");
            run(() =>
              attachVoteLinkAction({
                measureId,
                applicableRevisionId: String(data.get("applicableRevisionId")),
                situation: built,
                rationale: String(data.get("rationale") ?? ""),
                checkedAt: String(data.get("checkedAt") ?? ""),
                institutionScope: chambers,
                legislatureScope: legislatures,
                searchMethod: String(data.get("searchMethod") ?? ""),
              })
            );
          }}
        >
          <div>
            <label htmlFor="votelink-revision" className={LABEL}>
              Révision concernée
            </label>
            <select
              id="votelink-revision"
              name="applicableRevisionId"
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

          <fieldset className="space-y-2">
            <legend className={LEGEND}>Situation</legend>
            {SITUATION_KINDS.map((kind) => (
              <label key={kind} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="situation"
                  value={kind}
                  checked={situation === kind}
                  onChange={() => setSituation(kind)}
                  className="mt-1"
                />
                <span>{MEASURE_VOTE_LINK_KIND_LABELS[kind]}</span>
              </label>
            ))}
          </fieldset>

          {situation === "NO_VOTE_IDENTIFIED" && (
            <p className="rounded border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              La recherche a bien eu lieu et n&apos;a rien trouvé dans le périmètre documenté. Ce
              n&apos;est pas une absence au scrutin : il n&apos;y a pas de scrutin à rattacher.
            </p>
          )}

          {(situation === "SAME_OBJECT" || situation === "BROADER_TEXT") && (
            <div>
              <label htmlFor="votelink-scrutin" className={LABEL}>
                Identifiant du scrutin
              </label>
              <input
                id="votelink-scrutin"
                name="scrutinId"
                type="text"
                required
                className={FIELD}
                placeholder="Collé à la main pour l'instant ; une recherche viendra plus tard"
              />
            </div>
          )}

          {situation === "SAME_OBJECT" && (
            <>
              <fieldset className="space-y-2">
                <legend className={LEGEND}>Relation du candidat à la mesure</legend>
                {RELATIONS.map((relation) => (
                  <label key={relation} className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="relation"
                      value={relation}
                      required
                      className="mt-1"
                    />
                    <span>{MEASURE_VOTE_RELATION_LABELS[relation]}</span>
                  </label>
                ))}
                <p className="text-xs text-muted-foreground">
                  « Absent(e) au scrutin » suppose un scrutin identifié auquel la personne n&apos;a
                  pas pris part. C&apos;est une relation sur un scrutin, distincte de « aucun
                  scrutin trouvé ».
                </p>
              </fieldset>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isReference" />
                <span>Scrutin de référence pour cette révision (au plus un)</span>
              </label>
            </>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="votelink-checked" className={LABEL}>
                Date de vérification
              </label>
              <input
                id="votelink-checked"
                name="checkedAt"
                type="date"
                required
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor="votelink-legislatures" className={LABEL}>
                Législatures examinées
              </label>
              <input
                id="votelink-legislatures"
                name="legislatureScope"
                type="text"
                className={FIELD}
                placeholder="17, 16 (séparées par des espaces ou des virgules)"
              />
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className={LEGEND}>Chambres examinées</legend>
            <div className="flex flex-wrap gap-4">
              {CHAMBERS.map((chamber) => (
                <label key={chamber} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="institutionScope" value={chamber} />
                  <span>{CHAMBER_LABELS[chamber]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="votelink-method" className={LABEL}>
              Méthode de recherche
            </label>
            <input
              id="votelink-method"
              name="searchMethod"
              type="text"
              required
              className={FIELD}
              placeholder="Requête, filtre, source consultée"
            />
          </div>

          <div>
            <label htmlFor="votelink-rationale" className={LABEL}>
              Justification / constat
            </label>
            <textarea
              id="votelink-rationale"
              name="rationale"
              required
              rows={3}
              className={FIELD}
            />
          </div>

          <button type="submit" className={BUTTON} disabled={pending}>
            Enregistrer le rattachement
          </button>
        </form>
      )}
    </div>
  );
}
