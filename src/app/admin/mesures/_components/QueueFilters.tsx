import Link from "next/link";
import { PUBLICATION_STATE_LABELS, THEME_CATEGORY_LABELS } from "@/config/labels";
import type { ThemeCategory } from "@/generated/prisma";
import type { PublicationState } from "@/lib/measures/moderation-state";
import { THEMES_IN_ORDER } from "@/lib/presidentielle/themes";
import type {
  EnrichmentState,
  MeasureQueueCandidateOption,
  MeasureQueueResult,
} from "../_data/queue-query";

/**
 * Filters as plain links, server-rendered.
 *
 * No `useSearchParams`, no client component: the page already reads its parameters from
 * `searchParams` on the server, and a filter bar made of links keeps the route static and
 * needs no Suspense boundary.
 */

export type QueueFilterState = {
  publication: PublicationState[];
  theme: ThemeCategory[];
  candidacyId: string | undefined;
  anomaliesOnly: boolean;
  enrichment: EnrichmentState | undefined;
  withdrawn: "only" | "exclude" | undefined;
  q: string | undefined;
  publicCorpus: "PRESIDENTIELLE_2027" | undefined;
};

const BASE_PATH = "/admin/mesures";

// 44px minimum touch target, per the accessibility rules of the design.
const TAB =
  "inline-flex min-h-11 items-center rounded border border-border px-3 py-2 text-sm hover:bg-muted";
const TAB_ACTIVE = "bg-muted font-medium";

const PUBLICATION_ORDER: PublicationState[] = [
  "DRAFT",
  "REVIEWED",
  "PUBLISHED",
  "DEPUBLISHED",
  "EMPTY",
];

function hrefWith(current: QueueFilterState, patch: Partial<QueueFilterState>): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();

  for (const state of next.publication) params.append("etat", state);
  for (const theme of next.theme) params.append("theme", theme);
  if (next.candidacyId) params.set("candidat", next.candidacyId);
  if (next.anomaliesOnly) params.set("anomalies", "1");
  if (next.enrichment) params.set("enrichissement", next.enrichment);
  if (next.withdrawn) params.set("retrait", next.withdrawn);
  if (next.q) params.set("q", next.q);
  if (next.publicCorpus === "PRESIDENTIELLE_2027") {
    params.set("corpus", "presidentielle-2027");
  }

  const query = params.toString();
  return query === "" ? BASE_PATH : `${BASE_PATH}?${query}`;
}

function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

export function QueueFilters({
  current,
  result,
  candidates,
}: {
  current: QueueFilterState;
  result: MeasureQueueResult;
  candidates: MeasureQueueCandidateOption[];
}) {
  const themeKeys: readonly ThemeCategory[] = THEMES_IN_ORDER;

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Étape du cycle
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            href={hrefWith(current, { publication: [] })}
            prefetch={false}
            className={`${TAB} ${current.publication.length === 0 ? TAB_ACTIVE : ""}`}
          >
            Toutes
          </Link>
          {PUBLICATION_ORDER.map((state) => (
            <Link
              key={state}
              href={hrefWith(current, { publication: toggle(current.publication, state) })}
              prefetch={false}
              className={`${TAB} ${current.publication.includes(state) ? TAB_ACTIVE : ""}`}
              aria-current={current.publication.includes(state) ? "true" : undefined}
            >
              {PUBLICATION_STATE_LABELS[state]}
              <span className="ml-1.5 text-muted-foreground">{result.counts[state]}</span>
            </Link>
          ))}
        </div>
      </fieldset>

      {candidates.length > 0 && (
        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Candidat
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href={hrefWith(current, { candidacyId: undefined })}
              prefetch={false}
              className={`${TAB} ${current.candidacyId === undefined ? TAB_ACTIVE : ""}`}
            >
              Tous les candidats
            </Link>
            {candidates.map((candidate) => (
              <Link
                key={candidate.id}
                href={hrefWith(current, {
                  candidacyId: current.candidacyId === candidate.id ? undefined : candidate.id,
                })}
                prefetch={false}
                className={`${TAB} ${current.candidacyId === candidate.id ? TAB_ACTIVE : ""}`}
                aria-current={current.candidacyId === candidate.id ? "true" : undefined}
                title={candidate.electionTitle}
              >
                {candidate.candidateName}
              </Link>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Enrichissement éditorial
        </legend>
        <p className="mt-1 text-xs text-muted-foreground">
          Ces boutons filtrent la file. Les actions de traitement apparaissent ensuite dans le
          tableau.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            href={hrefWith(current, { enrichment: undefined })}
            prefetch={false}
            className={`${TAB} ${current.enrichment === undefined ? TAB_ACTIVE : ""}`}
          >
            Toutes
          </Link>
          {(
            [
              ["SUBTOPICS_PENDING", "Sous-thèmes à valider"],
              ["SUBTOPICS_APPROVED", "Sous-thèmes validés"],
              ["DETAILS_MISSING", "Contexte à compléter"],
            ] as const
          ).map(([state, label]) => (
            <Link
              key={state}
              href={hrefWith(current, {
                enrichment: current.enrichment === state ? undefined : state,
              })}
              prefetch={false}
              className={`${TAB} ${current.enrichment === state ? TAB_ACTIVE : ""}`}
              aria-current={current.enrichment === state ? "true" : undefined}
            >
              {label}
              <span className="ml-1.5 text-muted-foreground">{result.enrichmentCounts[state]}</span>
            </Link>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Signalements
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            href={hrefWith(current, { anomaliesOnly: !current.anomaliesOnly })}
            prefetch={false}
            className={`${TAB} ${current.anomaliesOnly ? TAB_ACTIVE : ""}`}
            aria-current={current.anomaliesOnly ? "true" : undefined}
          >
            Anomalies seulement
            <span className="ml-1.5 text-muted-foreground">{result.anomalyCount}</span>
          </Link>
          <Link
            href={hrefWith(current, {
              withdrawn: current.withdrawn === "only" ? undefined : "only",
            })}
            prefetch={false}
            className={`${TAB} ${current.withdrawn === "only" ? TAB_ACTIVE : ""}`}
            aria-current={current.withdrawn === "only" ? "true" : undefined}
          >
            Retraits
            <span className="ml-1.5 text-muted-foreground">{result.withdrawnCount}</span>
          </Link>
          <Link
            href={hrefWith(current, {
              withdrawn: current.withdrawn === "exclude" ? undefined : "exclude",
            })}
            prefetch={false}
            className={`${TAB} ${current.withdrawn === "exclude" ? TAB_ACTIVE : ""}`}
            aria-current={current.withdrawn === "exclude" ? "true" : undefined}
          >
            Hors retraits
          </Link>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Thème
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {themeKeys.map((theme) => (
            <Link
              key={theme}
              href={hrefWith(current, { theme: toggle(current.theme, theme) })}
              prefetch={false}
              className={`${TAB} ${current.theme.includes(theme) ? TAB_ACTIVE : ""}`}
              aria-current={current.theme.includes(theme) ? "true" : undefined}
            >
              {THEME_CATEGORY_LABELS[theme]}
            </Link>
          ))}
        </div>
      </fieldset>

      <form action={BASE_PATH} method="get" className="flex flex-wrap items-end gap-2">
        {/* A GET form submits only its own fields, so the active filters travel as hidden
            inputs. Without them, searching would silently reset every other filter. */}
        {current.publication.map((state) => (
          <input key={state} type="hidden" name="etat" value={state} />
        ))}
        {current.theme.map((theme) => (
          <input key={theme} type="hidden" name="theme" value={theme} />
        ))}
        {current.candidacyId && <input type="hidden" name="candidat" value={current.candidacyId} />}
        {current.anomaliesOnly && <input type="hidden" name="anomalies" value="1" />}
        {current.enrichment && (
          <input type="hidden" name="enrichissement" value={current.enrichment} />
        )}
        {current.withdrawn && <input type="hidden" name="retrait" value={current.withdrawn} />}
        {current.publicCorpus === "PRESIDENTIELLE_2027" ? (
          <input type="hidden" name="corpus" value="presidentielle-2027" />
        ) : null}

        <div className="flex-1">
          <label
            htmlFor="queue-search"
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Chercher dans le texte des révisions
          </label>
          <input
            id="queue-search"
            name="q"
            type="search"
            defaultValue={current.q ?? ""}
            className="mt-2 min-h-11 w-full rounded border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <button type="submit" className={TAB}>
          Chercher
        </button>
      </form>
    </div>
  );
}
