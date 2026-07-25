"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";

// Affaires v2, lot 1: review queue for importer-proposed affair changes.
// Every automated write to an existing affair lands here first.

type ProposalStatus = "PENDING" | "APPROVED" | "REJECTED" | "AUTO_APPLIED" | "CONFLICT";
type ProposalRisk = "LOW" | "MEDIUM" | "HIGH";

interface ProposalRow {
  id: string;
  importer: string;
  extractorVersion: string;
  proposedPatch: Record<string, unknown>;
  observedValues: Record<string, unknown>;
  source: string;
  sourceUrl: string | null;
  officialId: string | null;
  sourceExcerpt: string | null;
  confidence: number;
  riskLevel: ProposalRisk;
  rationale: string;
  status: ProposalStatus;
  conflictDetail: Record<string, { expected: string; actual: string }> | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNotes: string | null;
  createdAt: string;
  affair: {
    id: string;
    title: string;
    slug: string;
    publicationStatus: string;
    politician: { fullName: string; slug: string };
  };
}

interface ListResponse {
  rows: ProposalRow[];
  total: number;
  page: number;
  totalPages: number;
  counts: Partial<Record<ProposalStatus, number>>;
}

const TABS: { key: ProposalStatus; label: string }[] = [
  { key: "PENDING", label: "En attente" },
  { key: "CONFLICT", label: "Conflits" },
  { key: "APPROVED", label: "Acceptées" },
  { key: "REJECTED", label: "Rejetées" },
  { key: "AUTO_APPLIED", label: "Auto-appliquées" },
];

const RISK_LABELS: Record<ProposalRisk, string> = {
  HIGH: "Risque élevé",
  MEDIUM: "Risque moyen",
  LOW: "Risque faible",
};

const RISK_VARIANTS: Record<ProposalRisk, "destructive" | "secondary" | "outline"> = {
  HIGH: "destructive",
  MEDIUM: "secondary",
  LOW: "outline",
};

const FIELD_LABELS: Record<string, string> = {
  status: "Statut procédural",
  involvement: "Implication",
  category: "Catégorie",
  severity: "Gravité",
  factsDate: "Date des faits",
  startDate: "Date de révélation",
  verdictDate: "Date de décision",
  court: "Juridiction",
  chamber: "Chambre",
  caseNumber: "N° de dossier",
  sentence: "Peine (résumé)",
  prisonMonths: "Prison (mois)",
  prisonSuspended: "Sursis",
  fineAmount: "Amende (€)",
  ineligibilityMonths: "Inéligibilité (mois)",
  communityService: "TIG (heures)",
  otherSentence: "Autre peine",
  ecli: "ECLI",
  pourvoiNumber: "N° de pourvoi",
  caseNumbers: "N° de dossiers",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/** Mirrors EMPTY_VALUE from services/affairs/proposals, shown in conflict details. */
const EMPTY_MARKER = "∅";

function formatConflictValue(value: string): string {
  return value === EMPTY_MARKER ? "vide" : value;
}

/** Values arrive as JSON, so dates are ISO strings and arrays stay arrays. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  if (typeof value === "boolean") return value ? "oui" : "non";
  if (typeof value === "string" && ISO_DATE.test(value)) {
    return new Date(value).toLocaleDateString("fr-FR");
  }
  return String(value);
}

export default function PropositionsPage() {
  const [tab, setTab] = useState<ProposalStatus>("PENDING");
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ kind: "error" | "success"; message: string } | null>(
    null
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/affaires/propositions?status=${tab}&page=${page}`);
      if (!res.ok) throw new Error("Chargement impossible");
      setData((await res.json()) as ListResponse);
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Erreur inconnue",
      });
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, action: "accept" | "reject") {
    setBusyId(id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/affaires/propositions/${id}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(notes[id] ? { reviewNotes: notes[id] } : {}),
      });
      const payload = (await res.json()) as {
        error?: string;
        conflictDetail?: Record<string, { expected: string; actual: string }>;
      };
      if (!res.ok) {
        setFeedback({
          kind: "error",
          message:
            res.status === 409 && payload.conflictDetail
              ? "La valeur en base a changé depuis la proposition. Elle passe en conflit."
              : (payload.error ?? "Action refusée"),
        });
      } else {
        setFeedback({
          kind: "success",
          message: action === "accept" ? "Proposition appliquée." : "Proposition rejetée.",
        });
      }
      await load();
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Erreur inconnue",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Propositions de modification</h1>
        <p className="text-muted-foreground max-w-3xl text-sm">
          Les synchroniseurs ne modifient plus directement une affaire existante. Chaque changement
          arrive ici avec sa source, son extrait justificatif et la valeur actuelle, pour être
          accepté ou rejeté explicitement.
        </p>
      </header>

      <nav aria-label="Filtrer par état" className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const count = data?.counts?.[t.key];
          const active = tab === t.key;
          return (
            <Button
              key={t.key}
              variant={active ? "default" : "outline"}
              size="sm"
              aria-current={active ? "page" : undefined}
              onClick={() => {
                setTab(t.key);
                setPage(1);
              }}
            >
              {t.label}
              {typeof count === "number" && (
                <span className="ml-2 text-xs opacity-80">{count}</span>
              )}
            </Button>
          );
        })}
      </nav>

      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={
            feedback.kind === "error"
              ? "border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
              : "rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400"
          }
        >
          {feedback.message}
        </div>
      )}

      {loading && (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Chargement…
        </p>
      )}

      {!loading && data?.rows.length === 0 && (
        <p className="text-muted-foreground text-sm">Aucune proposition dans cet état.</p>
      )}

      <ul className="space-y-4">
        {data?.rows.map((row) => {
          const fields = Object.keys(row.proposedPatch);
          return (
            <li key={row.id}>
              <Card>
                <CardContent className="space-y-4 pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/admin/affaires/${row.affair.id}/edit`}
                        className="font-semibold hover:underline"
                      >
                        {row.affair.title}
                      </Link>
                      <p className="text-muted-foreground text-sm">
                        {row.affair.politician.fullName} · {row.affair.publicationStatus}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={RISK_VARIANTS[row.riskLevel]}>
                        {RISK_LABELS[row.riskLevel]}
                      </Badge>
                      <Badge variant="outline">confiance {row.confidence}</Badge>
                      <Badge variant="outline">
                        {row.importer}@{row.extractorVersion}
                      </Badge>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <caption className="sr-only">
                        Valeurs actuelles et valeurs proposées pour {row.affair.title}
                      </caption>
                      <thead>
                        <tr className="text-muted-foreground text-left text-xs uppercase">
                          <th scope="col" className="py-2 pr-4 font-medium">
                            Champ
                          </th>
                          <th scope="col" className="py-2 pr-4 font-medium">
                            Actuel
                          </th>
                          <th scope="col" className="py-2 font-medium">
                            Proposé
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {fields.map((field) => (
                          <tr key={field} className="border-border/60 border-t">
                            <th scope="row" className="py-2 pr-4 text-left font-normal">
                              {FIELD_LABELS[field] ?? field}
                            </th>
                            <td className="text-muted-foreground py-2 pr-4">
                              {formatValue(row.observedValues[field])}
                            </td>
                            <td className="py-2 font-medium">
                              {formatValue(row.proposedPatch[field])}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {row.conflictDetail && (
                    <div className="border-destructive/40 bg-destructive/10 flex gap-2 rounded-md border px-3 py-2 text-sm">
                      <AlertTriangle
                        className="text-destructive mt-0.5 h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="font-medium">Conflit détecté</p>
                        <ul className="mt-1 space-y-0.5">
                          {Object.entries(row.conflictDetail).map(([field, detail]) => (
                            <li key={field}>
                              {FIELD_LABELS[field] ?? field} : attendu «&nbsp;
                              {formatConflictValue(detail.expected)}&nbsp;», trouvé «&nbsp;
                              {formatConflictValue(detail.actual)}&nbsp;»
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 text-sm">
                    <p>
                      <span className="text-muted-foreground">Justification : </span>
                      {row.rationale}
                    </p>
                    {row.sourceExcerpt && (
                      <blockquote className="border-border text-muted-foreground border-l-2 pl-3 italic">
                        {row.sourceExcerpt}
                      </blockquote>
                    )}
                    <p className="flex flex-wrap items-center gap-3">
                      {row.sourceUrl ? (
                        <a
                          href={row.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          {row.source}
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          <span className="sr-only">(nouvel onglet)</span>
                        </a>
                      ) : (
                        <span className="text-muted-foreground">{row.source}</span>
                      )}
                      {row.officialId && (
                        <span className="text-muted-foreground">{row.officialId}</span>
                      )}
                      <span className="text-muted-foreground">
                        {new Date(row.createdAt).toLocaleString("fr-FR")}
                      </span>
                    </p>
                  </div>

                  {row.status === "PENDING" ? (
                    <div className="space-y-2">
                      <label htmlFor={`note-${row.id}`} className="text-muted-foreground text-sm">
                        Note de revue (optionnelle)
                      </label>
                      <Textarea
                        id={`note-${row.id}`}
                        rows={2}
                        value={notes[row.id] ?? ""}
                        onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={() => void review(row.id, "accept")}
                          disabled={busyId === row.id}
                        >
                          Accepter et appliquer
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void review(row.id, "reject")}
                          disabled={busyId === row.id}
                        >
                          Rejeter
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      {row.reviewedBy && row.reviewedAt
                        ? `${row.status} par ${row.reviewedBy} le ${new Date(row.reviewedAt).toLocaleString("fr-FR")}`
                        : row.status}
                      {row.reviewNotes ? ` — ${row.reviewNotes}` : ""}
                    </p>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      {data && data.totalPages > 1 && (
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Précédent
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {data.page} sur {data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Suivant
          </Button>
        </div>
      )}
    </div>
  );
}
