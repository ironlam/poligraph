"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, LinkIcon, Loader2, Search } from "lucide-react";
import { BlockedAffairs } from "@/components/admin/BlockedAffairs";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { PoliticianPicker } from "@/components/admin/PoliticianPicker";

// ─── Types ───────────────────────────────────────────────────────

interface SignalResult {
  signalId: string;
  logLikelihoodRatio: number;
  explanation: string;
  disqualified?: { reason: string };
}

interface ScoredCandidate {
  candidateId: string;
  totalScore: number;
  signals: SignalResult[];
  disqualified?: { reason: string };
}

interface DecisionRow {
  id: string;
  candidateText: string;
  metadata: unknown;
  topCandidates: ScoredCandidate[];
  topScore: number;
  gap: number;
  source: string;
  sourceRef: string | null;
  createdAt: string;
  chosenPoliticianId: string | null;
  chosenPolitician: { id: string; fullName: string; slug: string } | null;
  affairId: string | null;
  affair: { id: string; title: string; publicationStatus: string } | null;
}

interface ReviewResponse {
  rows: DecisionRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

type TabValue = "UNDECIDED" | "NO_MATCH" | "SAME";

// ─── Constants ───────────────────────────────────────────────────

const TABS: { key: TabValue; label: string }[] = [
  { key: "UNDECIDED", label: "En attente" },
  { key: "NO_MATCH", label: "Sans candidat" },
  { key: "SAME", label: "SAME à confirmer" },
];

const SOURCE_LABELS: Record<string, string> = {
  JUDILIBRE: "Judilibre",
  PRESS: "Presse",
  FACTCHECK: "Fact-check",
};

// ─── Page ────────────────────────────────────────────────────────

export default function AffairMatchingReviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawTab = searchParams.get("tab");
  const tab: TabValue =
    rawTab === "NO_MATCH" ? "NO_MATCH" : rawTab === "SAME" ? "SAME" : "UNDECIDED";
  const currentPage = Math.max(1, parseInt(searchParams.get("page") || "1", 10));

  const [data, setData] = useState<ReviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      router.push(`/admin/affair-matching/review?${params.toString()}`);
    },
    [router, searchParams]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ tab, page: String(currentPage), limit: "20" });
      const res = await fetch(`/api/admin/affair-matching/review?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? `Erreur ${res.status}`);
      }
      const json = (await res.json()) as ReviewResponse;
      setData(json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tab, currentPage]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const noMatchResolve = async (
    decisionId: string,
    action: "OUT_OF_SCOPE" | "CREATE_POLITICIAN" | "MANUAL_PICK",
    chosenPoliticianId?: string
  ) => {
    setActionInProgress(`no-match-${decisionId}-${action}`);
    try {
      const res = await fetch("/api/admin/affair-matching/no-match-resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionId, action, chosenPoliticianId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? `Erreur ${res.status}`);
      }
      await fetchData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionInProgress(null);
    }
  };

  const confirmCandidate = async (decisionId: string, chosenPoliticianId: string) => {
    setActionInProgress(`confirm-${decisionId}-${chosenPoliticianId}`);
    try {
      const res = await fetch("/api/admin/affair-matching/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionId, chosenPoliticianId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? `Erreur ${res.status}`);
      }
      await fetchData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionInProgress(null);
    }
  };

  const rejectAll = async (decisionId: string, blocklistCandidateIds: string[]) => {
    setActionInProgress(`reject-${decisionId}`);
    try {
      const res = await fetch("/api/admin/affair-matching/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisionId,
          action: "MOVE_TO_NO_MATCH",
          blocklistCandidateIds,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? `Erreur ${res.status}`);
      }
      await fetchData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionInProgress(null);
    }
  };

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Révision des décisions de liaison"
        description="Confirmer ou rejeter les rapprochements qui empêchent une publication."
        help="La file En attente correspond aux décisions UNDECIDED non révisées."
      />

      {/* What actually has to be settled, before the full registry. */}
      <BlockedAffairs />

      {/* Tab bar */}
      <div
        className="flex gap-1 border-b border-border"
        role="tablist"
        aria-label="Type de décision"
      >
        {TABS.map((t) => {
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => updateParams({ tab: t.key, page: "" })}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                isActive
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              {t.label}
              {data && (
                <span
                  className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                    isActive ? "bg-foreground/10" : "bg-muted"
                  }`}
                >
                  {isActive ? data.total : ""}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
          role="alert"
        >
          <span>Erreur : {error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs underline hover:no-underline"
          >
            Fermer
          </button>
        </div>
      )}

      {/* Decision list */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Chargement...
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <LinkIcon
              className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3"
              aria-hidden="true"
            />
            <p className="text-sm text-muted-foreground">
              {tab === "UNDECIDED"
                ? "Aucune décision en attente."
                : tab === "SAME"
                  ? "Aucun rattachement automatique à confirmer."
                  : "Aucune décision sans candidat."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <DecisionCard
              key={row.id}
              row={row}
              tab={tab}
              actionInProgress={actionInProgress}
              onConfirm={confirmCandidate}
              onRejectAll={rejectAll}
              onNoMatchResolve={noMatchResolve}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {data.total} décision{data.total > 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => updateParams({ page: String(currentPage - 1) })}
              disabled={currentPage <= 1}
              className="p-2 rounded-md hover:bg-muted disabled:opacity-50 disabled:pointer-events-none"
              aria-label="Page précédente"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <span className="text-muted-foreground tabular-nums">
              {currentPage} / {data.totalPages}
            </span>
            <button
              type="button"
              onClick={() => updateParams({ page: String(currentPage + 1) })}
              disabled={currentPage >= data.totalPages}
              className="p-2 rounded-md hover:bg-muted disabled:opacity-50 disabled:pointer-events-none"
              aria-label="Page suivante"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DecisionCard ────────────────────────────────────────────────

function DecisionCard({
  row,
  tab,
  actionInProgress,
  onConfirm,
  onRejectAll,
  onNoMatchResolve,
}: {
  row: DecisionRow;
  tab: TabValue;
  actionInProgress: string | null;
  onConfirm: (decisionId: string, candidateId: string) => Promise<void>;
  onRejectAll: (decisionId: string, blocklistCandidateIds: string[]) => Promise<void>;
  onNoMatchResolve: (
    decisionId: string,
    action: "OUT_OF_SCOPE" | "CREATE_POLITICIAN" | "MANUAL_PICK",
    chosenPoliticianId?: string
  ) => Promise<void>;
}) {
  const sourceLabel = SOURCE_LABELS[row.source] ?? row.source;

  return (
    <article className="border border-border rounded-xl bg-card shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-start justify-between gap-4 px-4 py-3 bg-muted/30 border-b border-border">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[11px] shrink-0">
              {sourceLabel}
            </Badge>
            {row.sourceRef && (
              <span
                className="text-xs text-muted-foreground truncate max-w-[300px]"
                title={row.sourceRef}
              >
                {row.sourceRef}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {new Date(row.createdAt).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground shrink-0 tabular-nums space-y-0.5">
          <p>
            Score <span className="font-semibold text-foreground">{row.topScore.toFixed(1)}</span>
          </p>
          <p>
            Écart <span className="font-semibold text-foreground">{row.gap.toFixed(1)}</span>
          </p>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Candidate text excerpt */}
        <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
          {row.candidateText}
        </p>

        {/* Candidates (UNDECIDED only) */}
        {tab === "UNDECIDED" && row.topCandidates.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Candidats ({row.topCandidates.length})
            </p>
            {row.topCandidates.map((candidate, i) => {
              const firedSignals = candidate.signals.filter((s) => s.logLikelihoodRatio !== 0);
              const isConfirming =
                actionInProgress === `confirm-${row.id}-${candidate.candidateId}`;

              return (
                <div
                  key={candidate.candidateId}
                  className={`rounded-lg border px-3 py-2.5 ${
                    i === 0 ? "border-primary/30 bg-primary/5" : "border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {/* Candidate identity */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
                        <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">
                          {candidate.candidateId}
                        </code>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          score {candidate.totalScore.toFixed(1)}
                        </span>
                      </div>

                      {/* Signals */}
                      {firedSignals.length > 0 && (
                        <ul className="space-y-0.5">
                          {firedSignals.map((s) => {
                            const positive = s.logLikelihoodRatio > 0;
                            return (
                              <li key={s.signalId} className="flex items-baseline gap-1.5 text-xs">
                                <span
                                  className={`font-mono shrink-0 ${
                                    positive ? "text-emerald-600" : "text-red-500"
                                  }`}
                                >
                                  {positive ? "+" : ""}
                                  {s.logLikelihoodRatio.toFixed(1)}
                                </span>
                                <span className="text-muted-foreground/70 font-mono shrink-0">
                                  [{s.signalId}]
                                </span>
                                <span className="text-muted-foreground">{s.explanation}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    <Button
                      size="sm"
                      onClick={() => void onConfirm(row.id, candidate.candidateId)}
                      disabled={actionInProgress !== null}
                      aria-label={`Confirmer le candidat ${candidate.candidateId}`}
                      className="shrink-0"
                    >
                      {isConfirming ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      ) : null}
                      Confirmer
                    </Button>
                  </div>
                </div>
              );
            })}

            {/* Reject all */}
            <div className="pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void onRejectAll(
                    row.id,
                    row.topCandidates.map((c) => c.candidateId)
                  )
                }
                disabled={actionInProgress !== null}
                aria-label="Aucun de ces candidats - déplacer en No Match"
              >
                {actionInProgress === `reject-${row.id}` ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                Aucun de ces candidats
              </Button>
            </div>
          </div>
        )}

        {/* NO_MATCH tab: triage actions */}
        {tab === "NO_MATCH" && (
          <NoMatchActions
            decisionId={row.id}
            actionInProgress={actionInProgress}
            onResolve={onNoMatchResolve}
          />
        )}

        {/* SAME tab: confirm or reject the high-confidence rattachement */}
        {tab === "SAME" && (
          <div className="space-y-3 pt-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Rattachement automatique
            </p>
            <p className="text-xs text-muted-foreground">
              Rattachements automatiques à confiance élevée. À confirmer avant publication de l{"'"}
              affaire liée.
            </p>

            {/* Chosen politician */}
            {row.chosenPolitician && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Politicien rattaché</p>
                <p className="text-sm font-medium">{row.chosenPolitician.fullName}</p>
                <code className="text-[11px] font-mono text-muted-foreground">
                  {row.chosenPolitician.id}
                </code>
              </div>
            )}

            {/* Linked affair */}
            {row.affair && (
              <div className="rounded-lg border border-border px-3 py-2.5 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Affaire liée</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm">{row.affair.title}</p>
                  <Badge variant="outline" className="text-[11px] shrink-0">
                    {row.affair.publicationStatus}
                  </Badge>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                onClick={() =>
                  row.chosenPoliticianId
                    ? void onConfirm(row.id, row.chosenPoliticianId)
                    : undefined
                }
                disabled={actionInProgress !== null || row.chosenPoliticianId === null}
                aria-label={
                  row.chosenPolitician
                    ? `Confirmer le rattachement à ${row.chosenPolitician.fullName}`
                    : "Confirmer le rattachement"
                }
              >
                {actionInProgress === `confirm-${row.id}-${row.chosenPoliticianId ?? ""}` ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" aria-hidden="true" />
                ) : null}
                Confirmer le rattachement
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void onRejectAll(row.id, row.chosenPoliticianId ? [row.chosenPoliticianId] : [])
                }
                disabled={actionInProgress !== null}
                aria-label="Rejeter ce rattachement automatique"
              >
                {actionInProgress === `reject-${row.id}` ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" aria-hidden="true" />
                ) : null}
                Rejeter
              </Button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

// ─── NoMatchActions ──────────────────────────────────────────────

function NoMatchActions({
  decisionId,
  actionInProgress,
  onResolve,
}: {
  decisionId: string;
  actionInProgress: string | null;
  onResolve: (
    decisionId: string,
    action: "OUT_OF_SCOPE" | "CREATE_POLITICIAN" | "MANUAL_PICK",
    chosenPoliticianId?: string
  ) => Promise<void>;
}) {
  const [showSearch, setShowSearch] = useState(false);

  const isOutOfScopeLoading = actionInProgress === `no-match-${decisionId}-OUT_OF_SCOPE`;
  const isManualPickLoading = actionInProgress === `no-match-${decisionId}-MANUAL_PICK`;
  const isCreatingLoading = actionInProgress === `no-match-${decisionId}-CREATE_POLITICIAN`;
  const anyLoading = actionInProgress !== null;

  return (
    <div className="space-y-3 pt-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</p>

      <div className="flex flex-wrap gap-2">
        {/* Out of scope */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => void onResolve(decisionId, "OUT_OF_SCOPE")}
          disabled={anyLoading}
          aria-label="Marquer hors champ - politicien étranger ou hors périmètre"
        >
          {isOutOfScopeLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" aria-hidden="true" />
          ) : null}
          Hors champ
        </Button>

        {/* Manual pick toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowSearch((v) => !v)}
          disabled={anyLoading}
          aria-label="Choisir manuellement un politicien dans la base"
          aria-expanded={showSearch}
        >
          {isManualPickLoading || isCreatingLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" aria-hidden="true" />
          ) : (
            <Search className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
          )}
          Choisir manuellement
        </Button>

        {/* TODO: add a /admin/politiques/nouveau creation form, then link here
            so moderators can create a new politician and link it in one flow.
            For now, tell moderators to create via /admin/politiques, then
            use "Choisir manuellement" to pick the newly-created politician. */}
      </div>

      {/* Shared, bounded politician search */}
      {showSearch && (
        <PoliticianPicker
          value={null}
          onChange={(politicianId) => {
            if (politicianId) void onResolve(decisionId, "MANUAL_PICK", politicianId);
          }}
          label="Choisir une personnalité politique"
          description="Les candidats sont affichés avec leur parti, mandat, statut et slug."
        />
      )}
    </div>
  );
}
