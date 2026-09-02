"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  MEASURE_ATTRIBUTION_LABELS,
  MEASURE_PRECISION_LABELS,
  MEASURE_SOURCE_KIND_LABELS,
  SOURCE_TIER_LABELS,
  THEME_CATEGORY_LABELS,
} from "@/config/labels";
import type {
  MeasureAttribution,
  MeasurePrecision,
  MeasureSourceKind,
  SourceTier,
  ThemeCategory,
} from "@/generated/prisma";
import { THEMES_IN_ORDER } from "@/lib/presidentielle/themes";
import { createMeasureAction } from "../actions";
import type { CandidacyOption } from "../_data/candidacies-query";

/**
 * Creating a measure, from a candidacy.
 *
 * The candidacy supplies the politician, the election and the candidacy itself, so none of the three
 * is typed by hand: a free-text politician would let a measure be attributed to the wrong person,
 * which is the one mistake this project cannot afford.
 *
 * Deliberately NOT a generic editor for every case the model allows. A measure with no candidacy, a
 * programme edition or a lineage link are not offered here; they will be when a real case needs one.
 */

const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50";
const FIELD = "mt-1 min-h-11 w-full rounded border border-border bg-background px-3 py-2 text-sm";
const LABEL = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

const THEMES: readonly ThemeCategory[] = THEMES_IN_ORDER;
const ATTRIBUTIONS = Object.keys(MEASURE_ATTRIBUTION_LABELS) as MeasureAttribution[];
const SOURCE_KINDS = Object.keys(MEASURE_SOURCE_KIND_LABELS) as MeasureSourceKind[];
const TIERS = Object.keys(SOURCE_TIER_LABELS) as SourceTier[];
const PRECISIONS = Object.keys(MEASURE_PRECISION_LABELS) as MeasurePrecision[];

export function NewMeasureForm({ candidacies }: { candidacies: CandidacyOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);

  if (candidacies.length === 0) {
    return (
      <p className="rounded-lg border border-border p-4 text-sm">
        Aucune candidature à une élection présidentielle n&apos;est rattachée à un politicien, donc
        aucune mesure ne peut être créée. Rattacher une candidature d&apos;abord.
      </p>
    );
  }

  return (
    <form
      className="space-y-4 rounded-lg border border-border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const candidacy = candidacies.find(
          (option) => option.id === String(data.get("candidacyId"))
        );
        if (candidacy === undefined) {
          setFailure("Choisir une candidature");
          return;
        }

        setFailure(null);
        startTransition(async () => {
          const result = await createMeasureAction({
            candidacyId: candidacy.id,
            politicianId: candidacy.politicianId,
            electionId: candidacy.electionId,
            theme: String(data.get("theme")) as ThemeCategory,
            attribution: String(data.get("attribution")) as MeasureAttribution,
            revision: {
              text: String(data.get("text") ?? ""),
              details: String(data.get("details") ?? "").trim() || null,
              precision:
                String(data.get("precision") ?? "") === ""
                  ? null
                  : (String(data.get("precision")) as "CHIFFREE" | "OBJECTIF_SANS_CHIFFRE"),
              validFrom: String(data.get("validFrom") ?? ""),
              extractionMethod: "MANUAL",
            },
            sources: [
              {
                sourceKind: String(data.get("sourceKind")) as MeasureSourceKind,
                tier: String(data.get("tier")) as SourceTier,
                url: String(data.get("sourceUrl") ?? ""),
                page: String(data.get("page") ?? "") || null,
                publishedAt: String(data.get("sourcePublishedAt") ?? ""),
              },
            ],
          });

          if (result.ok && result.measureId !== undefined) {
            router.push(`/admin/mesures/${result.measureId}`);
            return;
          }
          setFailure(result.ok ? "Mesure créée sans identifiant renvoyé" : result.message);
        });
      }}
    >
      {failure !== null && (
        <p
          role="alert"
          aria-live="polite"
          className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          {failure}
        </p>
      )}

      <div>
        <label htmlFor="new-candidacy" className={LABEL}>
          Candidature
        </label>
        <select id="new-candidacy" name="candidacyId" required className={FIELD}>
          {candidacies.map((candidacy) => (
            <option key={candidacy.id} value={candidacy.id}>
              {candidacy.candidateName} · {candidacy.electionTitle}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          Elle fournit le politicien et l&apos;élection, qui ne sont donc pas saisis.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="new-theme" className={LABEL}>
            Thème
          </label>
          <select id="new-theme" name="theme" required className={FIELD}>
            {THEMES.map((theme) => (
              <option key={theme} value={theme}>
                {THEME_CATEGORY_LABELS[theme]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="new-attribution" className={LABEL}>
            Attribution
          </label>
          <select id="new-attribution" name="attribution" required className={FIELD}>
            {ATTRIBUTIONS.map((attribution) => (
              <option key={attribution} value={attribution}>
                {MEASURE_ATTRIBUTION_LABELS[attribution]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="new-text" className={LABEL}>
          Texte de la mesure
        </label>
        <textarea id="new-text" name="text" required rows={3} className={FIELD} />
      </div>

      <div>
        <label htmlFor="new-details" className={LABEL}>
          Détails documentés (facultatif)
        </label>
        <textarea id="new-details" name="details" rows={6} className={FIELD} />
        <p className="mt-1 text-xs text-muted-foreground">
          Ajoutez uniquement du contexte factuel présent dans les sources. Le Markdown simple est
          accepté. Ce contenu sera relu et publié avec cette révision.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="new-validfrom" className={LABEL}>
            En vigueur à partir du
          </label>
          <input id="new-validfrom" name="validFrom" type="date" required className={FIELD} />
        </div>
        <div>
          <label htmlFor="new-precision" className={LABEL}>
            Précision
          </label>
          <select id="new-precision" name="precision" className={FIELD}>
            <option value="">Non qualifiée</option>
            {PRECISIONS.map((precision) => (
              <option key={precision} value={precision}>
                {MEASURE_PRECISION_LABELS[precision]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset>
        <legend className={LABEL}>Source initiale</legend>
        <p className="mt-1 text-xs text-muted-foreground">
          Exigée : une révision sans source ne peut jamais être publiée.
        </p>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="new-sourcekind" className={LABEL}>
              Nature
            </label>
            <select id="new-sourcekind" name="sourceKind" className={FIELD}>
              {SOURCE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {MEASURE_SOURCE_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="new-tier" className={LABEL}>
              Rang
            </label>
            <select id="new-tier" name="tier" className={FIELD}>
              {TIERS.map((tier) => (
                <option key={tier} value={tier}>
                  {SOURCE_TIER_LABELS[tier]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="new-sourceurl" className={LABEL}>
              URL
            </label>
            <input id="new-sourceurl" name="sourceUrl" type="url" required className={FIELD} />
          </div>
          <div>
            <label htmlFor="new-sourcedate" className={LABEL}>
              Date de la source
            </label>
            <input
              id="new-sourcedate"
              name="sourcePublishedAt"
              type="date"
              required
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="new-page" className={LABEL}>
              Page (facultatif)
            </label>
            <input id="new-page" name="page" type="text" className={FIELD} />
          </div>
        </div>
      </fieldset>

      <button type="submit" className={BUTTON} disabled={pending}>
        Créer la mesure en brouillon
      </button>
      <p className="text-xs text-muted-foreground">
        La mesure est créée en brouillon. Rien n&apos;est publié avant une relecture puis une
        publication explicites.
      </p>
    </form>
  );
}
