"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { THEME_CATEGORY_LABELS } from "@/config/labels";
import type {
  AdminCandidacyThemeSyntheses,
  AdminThemeSynthesisRow,
} from "@/lib/data/candidacy-theme-syntheses";
import { formatDate } from "@/lib/utils";

const STATE_LABELS = {
  MISSING: "Absente",
  PENDING_REVIEW: "Générée à relire",
  PUBLISHED: "Publiée",
  OBSOLETE: "Obsolète",
} as const;

type Preview = {
  text: string;
  model: string;
  measureCount: number;
  claims: Array<{ text: string; measureRefs: string[] }>;
};

function readPreviewClaims(value: unknown): Preview["claims"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((claim) => {
    if (
      typeof claim !== "object" ||
      claim === null ||
      typeof (claim as { text?: unknown }).text !== "string" ||
      !Array.isArray((claim as { measureRefs?: unknown }).measureRefs)
    ) {
      return [];
    }
    const measureRefs = (claim as { measureRefs: unknown[] }).measureRefs.filter(
      (reference): reference is string => typeof reference === "string"
    );
    return [{ text: (claim as { text: string }).text, measureRefs }];
  });
}

function ThemeSynthesisEvidence({
  claims,
  row,
}: {
  claims: Preview["claims"];
  row: AdminThemeSynthesisRow;
}) {
  if (claims.length === 0) return null;
  return (
    <details className="max-w-[90ch] rounded-lg border bg-muted/20 p-3 text-sm">
      <summary className="min-h-11 cursor-pointer py-3 font-semibold">
        Vérifier les affirmations dans les mesures
      </summary>
      <ol className="mt-2 space-y-4">
        {claims.map((claim, index) => (
          <li key={`${row.theme}-claim-${index}`}>
            <p className="leading-relaxed">{claim.text}</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {claim.measureRefs.map((reference) => {
                const measure = row.measures.find((candidate) => candidate.ref === reference);
                if (!measure) return null;
                return (
                  <li key={`${index}-${reference}`}>
                    <Link
                      href={`/admin/mesures/${measure.id}`}
                      className="inline-flex min-h-11 items-center rounded-md border px-3 font-semibold underline underline-offset-2"
                    >
                      {reference} : {measure.text}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </details>
  );
}

async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Échec");
  return payload;
}

export function ThemeSynthesesClient({ data }: { data: AdminCandidacyThemeSyntheses }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, Preview>>({});

  async function generate(row: AdminThemeSynthesisRow, persist: boolean) {
    setBusy(`${persist ? "generate" : "preview"}:${row.theme}`);
    setMessage(null);
    try {
      const result = await postJson(
        `/api/admin/candidats/${data.candidacyId}/theme-syntheses/generate`,
        { theme: row.theme, persist }
      );
      if (persist) {
        setMessage(`${THEME_CATEGORY_LABELS[row.theme]} : brouillon généré.`);
        router.refresh();
      } else {
        setPreviews((current) => ({
          ...current,
          [row.theme]: {
            text: String(result.text ?? ""),
            model: String(result.model ?? "Mistral"),
            measureCount: Number(result.measureCount ?? row.measureCount),
            claims: readPreviewClaims(result.claims),
          },
        }));
      }
    } catch (error) {
      setMessage(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  }

  async function publish(row: AdminThemeSynthesisRow) {
    if (!row.synthesis) return;
    setBusy(`publish:${row.theme}`);
    setMessage(null);
    try {
      await postJson(`/api/admin/candidats/${data.candidacyId}/theme-syntheses/publish`, {
        synthesisId: row.synthesis.id,
        corpusFingerprint: row.currentCorpusFingerprint,
        contentFingerprint: row.synthesis.contentFingerprint,
      });
      setMessage(`${THEME_CATEGORY_LABELS[row.theme]} : synthèse publiée.`);
      router.refresh();
    } catch (error) {
      setMessage(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  }

  async function generateBatch() {
    const rows = data.themes.filter((row) => row.state === "MISSING" || row.state === "OBSOLETE");
    setBusy("batch");
    setMessage(`Génération de 0 sur ${rows.length} thème(s).`);
    try {
      for (const [index, row] of rows.entries()) {
        await postJson(`/api/admin/candidats/${data.candidacyId}/theme-syntheses/generate`, {
          theme: row.theme,
          persist: true,
        });
        setMessage(`Génération de ${index + 1} sur ${rows.length} thème(s).`);
      }
      setMessage(`${rows.length} brouillon(s) généré(s), à relire avant publication.`);
      router.refresh();
    } catch (error) {
      setMessage(`Lot interrompu : ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  }

  const batchCount = data.themes.filter(
    (row) => row.state === "MISSING" || row.state === "OBSOLETE"
  ).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
        <button
          type="button"
          onClick={generateBatch}
          disabled={busy !== null || batchCount === 0}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {busy === "batch"
            ? "Génération en cours..."
            : `Générer les ${batchCount} synthèses absentes ou obsolètes`}
        </button>
        <p className="text-xs text-muted-foreground">
          Le lot crée des brouillons. Il ne publie rien automatiquement.
        </p>
      </div>

      {message && (
        <p role="status" aria-live="polite" className="rounded-lg border bg-muted/40 p-3 text-sm">
          {message}
        </p>
      )}

      <div className="space-y-4">
        {data.themes.map((row) => {
          const preview = previews[row.theme];
          const locked = busy !== null;
          return (
            <section
              key={row.theme}
              aria-labelledby={`theme-${row.theme}`}
              className="rounded-xl border bg-card p-4 md:p-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 id={`theme-${row.theme}`} className="font-display text-lg font-bold">
                  {THEME_CATEGORY_LABELS[row.theme]}
                </h2>
                <Badge variant="outline">{STATE_LABELS[row.state]}</Badge>
                <span className="text-xs text-muted-foreground">
                  {row.measureCount}{" "}
                  {row.measureCount === 1 ? "mesure publiée" : "mesures publiées"}
                </span>
              </div>

              {row.synthesis && (
                <div className="mt-3 space-y-2">
                  <p className="max-w-[80ch] text-sm leading-relaxed">{row.synthesis.text}</p>
                  <p className="text-xs text-muted-foreground">
                    Générée le {formatDate(row.synthesis.generatedAt)} avec {row.synthesis.model}
                    {row.synthesis.validatedAt
                      ? `, relue le ${formatDate(row.synthesis.validatedAt)}`
                      : ""}
                  </p>
                  <ThemeSynthesisEvidence claims={row.synthesis.claims} row={row} />
                </div>
              )}

              {preview && (
                <aside
                  aria-label={`Prévisualisation pour ${THEME_CATEGORY_LABELS[row.theme]}`}
                  className="mt-3 rounded-lg border border-dashed bg-muted/30 p-3"
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Prévisualisation, non enregistrée
                  </p>
                  <p className="mt-2 max-w-[80ch] text-sm leading-relaxed">{preview.text}</p>
                  <div className="mt-3">
                    <ThemeSynthesisEvidence claims={preview.claims} row={row} />
                  </div>
                </aside>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => generate(row, false)}
                  disabled={locked}
                  className="inline-flex min-h-11 items-center justify-center rounded-md border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50"
                >
                  {busy === `preview:${row.theme}` ? "Préparation..." : "Prévisualiser"}
                </button>
                <button
                  type="button"
                  onClick={() => generate(row, true)}
                  disabled={locked}
                  className="inline-flex min-h-11 items-center justify-center rounded-md border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50"
                >
                  {busy === `generate:${row.theme}`
                    ? "Génération..."
                    : row.synthesis
                      ? "Régénérer le brouillon"
                      : "Générer le brouillon"}
                </button>
                {row.state === "PENDING_REVIEW" && row.synthesis && (
                  <button
                    type="button"
                    onClick={() => publish(row)}
                    disabled={locked}
                    className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
                  >
                    {busy === `publish:${row.theme}` ? "Publication..." : "Valider et publier"}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
