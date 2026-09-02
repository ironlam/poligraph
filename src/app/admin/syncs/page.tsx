"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  Play,
  Clock,
  CheckCircle2,
  XCircle,
  Square,
  ChevronDown,
  ChevronRight,
  Loader2,
  Zap,
  History,
  ExternalLink,
} from "lucide-react";
import { SyncsPageSkeleton } from "./_components/SyncsPageSkeleton";

// ─── Types ───────────────────────────────────────────────

interface SyncJob {
  id: string;
  script: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  progress: number;
  total: number | null;
  processed: number | null;
  result: Record<string, unknown> | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface ApiResponse {
  data: SyncJob[];
  running: SyncJob[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ─── Script catalog ──────────────────────────────────────

interface ScriptDef {
  id: string;
  label: string;
  description: string;
}

interface ScriptCategory {
  name: string;
  scripts: ScriptDef[];
}

const SCRIPT_CATALOG: ScriptCategory[] = [
  {
    name: "Données principales",
    scripts: [
      {
        id: "sync-assemblee",
        label: "Assemblée nationale",
        description: "Députés, commissions, groupes",
      },
      { id: "sync-senat", label: "Sénat", description: "Sénateurs et groupes" },
      { id: "sync-gouvernement", label: "Gouvernement", description: "Ministres en exercice" },
      { id: "sync-president", label: "Présidence", description: "Président de la République" },
      { id: "sync-europarl", label: "Parlement européen", description: "Eurodéputés français" },
    ],
  },
  {
    name: "Enrichissement",
    scripts: [
      { id: "sync-wikidata-ids", label: "Wikidata IDs", description: "Identifiants Wikidata" },
      { id: "sync-photos", label: "Photos", description: "Photos officielles" },
      { id: "sync-birthdates", label: "Dates de naissance", description: "Via Wikidata" },
      { id: "sync-careers", label: "Carrières", description: "Parcours politiques" },
      { id: "sync-partis", label: "Partis", description: "Partis politiques" },
      { id: "sync-mep-parties", label: "Partis MEP", description: "Affiliations eurodéputés" },
      { id: "sync-hatvp", label: "HATVP", description: "Déclarations de patrimoine" },
      { id: "sync-deceased", label: "Décès", description: "Politiciens décédés" },
    ],
  },
  {
    name: "Scrutins & Législation",
    scripts: [
      { id: "sync-scrutins-an", label: "Scrutins AN", description: "Scrutins Assemblée nationale" },
      { id: "sync-scrutins-senat", label: "Scrutins Sénat", description: "Scrutins Sénat" },
      { id: "sync-legislation", label: "Législation", description: "Dossiers législatifs" },
      {
        id: "sync-legislation-content",
        label: "Exposés des motifs",
        description: "Contenu des textes",
      },
    ],
  },
  {
    name: "Presse & Fact-checks",
    scripts: [
      { id: "sync-press", label: "Presse RSS", description: "Articles via flux RSS" },
      {
        id: "sync-press-analysis",
        label: "Analyse presse",
        description: "Analyse IA des articles",
      },
      { id: "sync-factchecks", label: "Fact-checks", description: "Google Fact Check API" },
      { id: "sync-judilibre", label: "Judilibre", description: "Décisions de justice" },
    ],
  },
  {
    name: "Classification & Index",
    scripts: [
      { id: "classify-themes", label: "Classification", description: "Thèmes des dossiers" },
      { id: "index-embeddings", label: "Embeddings", description: "Index vectoriel RAG" },
      {
        id: "reindex-measures-search",
        label: "Recherche des mesures 2027",
        description: "Reconstruit l'index lexical des mesures de la présidentielle",
      },
    ],
  },
  {
    name: "Maintenance",
    scripts: [
      { id: "recalculate-prominence", label: "Prominence", description: "Recalcul scores" },
      { id: "assign-publication-status", label: "Publication status", description: "Statuts auto" },
      { id: "reconcile-affairs", label: "Réconciliation", description: "Doublons d'affaires" },
      {
        id: "compute-municipales-snapshots",
        label: "Snapshots municipales 2026",
        description: "Pré-calcul parité et dept × parti",
      },
    ],
  },
];

// ─── Status config ───────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING: { label: "En attente", className: "bg-gray-50 text-gray-600 border-gray-200" },
  RUNNING: { label: "En cours", className: "bg-blue-50 text-blue-700 border-blue-200" },
  COMPLETED: { label: "Terminé", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  FAILED: { label: "Échoué", className: "bg-red-50 text-red-700 border-red-200" },
};

// ─── Helpers ─────────────────────────────────────────────

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "—";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const sec = Math.floor((e - s) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem}s`;
}

function scriptLabel(scriptId: string): string {
  for (const cat of SCRIPT_CATALOG) {
    const found = cat.scripts.find((s) => s.id === scriptId);
    if (found) return found.label;
  }
  return scriptId;
}

// ─── Component ───────────────────────────────────────────

export default function SyncsPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/syncs?limit=20");
      if (res.ok) {
        const json: ApiResponse = await res.json();
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll while jobs are running
  const hasRunning = (data?.running?.length ?? 0) > 0;

  useEffect(() => {
    if (hasRunning) {
      pollRef.current = setInterval(fetchData, 3000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [hasRunning, fetchData]);

  async function cancelJob(jobId: string) {
    setCancelling(jobId);
    try {
      const res = await fetch(`/api/admin/syncs/${jobId}`, { method: "PATCH" });
      if (res.ok) {
        toast.success("Job annulé");
        await fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || "Erreur lors de l'annulation");
      }
    } finally {
      setCancelling(null);
    }
  }

  async function launchScript(scriptId: string) {
    setLaunching(scriptId);
    try {
      const res = await fetch("/api/admin/syncs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: scriptId }),
      });
      if (res.ok) {
        await fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || "Erreur lors du lancement");
      }
    } finally {
      setLaunching(null);
    }
  }

  function toggleCategory(name: string) {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleError(id: string) {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const runningJobs = data?.running || [];
  const historyJobs = data?.data || [];
  const runningScripts = new Set(runningJobs.map((j) => j.script));

  // Find latest completed job per script for "last run" info
  const lastRunByScript = new Map<string, SyncJob>();
  for (const job of historyJobs) {
    if (
      !lastRunByScript.has(job.script) &&
      (job.status === "COMPLETED" || job.status === "FAILED")
    ) {
      lastRunByScript.set(job.script, job);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Synchronisation</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Lancement et suivi des scripts d&apos;import de données
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://app.inngest.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            Inngest
          </a>
          <Button onClick={() => launchScript("sync-daily")} disabled={launching !== null}>
            {launching === "sync-daily" ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Zap className="w-4 h-4 mr-2" aria-hidden="true" />
            )}
            Sync quotidien
          </Button>
        </div>
      </div>

      {loading ? (
        <SyncsPageSkeleton />
      ) : (
        <>
          {/* Running jobs */}
          {runningJobs.length > 0 && (
            <Card className="border-blue-200 bg-blue-50/30">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-blue-800">
                  <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                  {runningJobs.length} sync en cours
                </div>
                {runningJobs.map((job) => (
                  <div key={job.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{scriptLabel(job.script)}</span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                        {job.processed != null && job.total
                          ? `${job.processed}/${job.total}`
                          : `${job.progress}%`}
                        {" · "}
                        {formatDuration(job.startedAt || job.createdAt, null)}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600"
                          onClick={() => cancelJob(job.id)}
                          disabled={cancelling === job.id}
                          aria-label={`Annuler ${scriptLabel(job.script)}`}
                        >
                          {cancelling === job.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Square className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </span>
                    </div>
                    <div
                      className="h-2 rounded-full bg-blue-100 overflow-hidden"
                      role="progressbar"
                      aria-valuenow={job.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Progression de ${scriptLabel(job.script)}`}
                    >
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-500"
                        style={{ width: `${Math.max(job.progress, 2)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Script catalog */}
          <div className="space-y-3">
            {SCRIPT_CATALOG.map((cat) => {
              const isCollapsed = collapsedCats.has(cat.name);
              return (
                <Card key={cat.name}>
                  <CardContent className="p-0">
                    <button
                      onClick={() => toggleCategory(cat.name)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors rounded-t-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      aria-expanded={!isCollapsed}
                      aria-label={`${isCollapsed ? "Afficher" : "Masquer"} ${cat.name}`}
                    >
                      <span className="text-sm font-medium">{cat.name}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {cat.scripts.length} scripts
                        </span>
                        {isCollapsed ? (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </span>
                    </button>

                    {!isCollapsed && (
                      <div className="border-t border-border divide-y divide-border/60">
                        {cat.scripts.map((script) => {
                          const isRunning = runningScripts.has(script.id);
                          const isLaunching = launching === script.id;
                          const lastRun = lastRunByScript.get(script.id);

                          return (
                            <div key={script.id} className="flex items-center gap-4 px-4 py-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{script.label}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {script.description}
                                  </span>
                                </div>
                                {lastRun && (
                                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                                    {lastRun.status === "COMPLETED" ? (
                                      <CheckCircle2
                                        className="w-3 h-3 text-emerald-500"
                                        aria-hidden="true"
                                      />
                                    ) : (
                                      <XCircle
                                        className="w-3 h-3 text-red-500"
                                        aria-hidden="true"
                                      />
                                    )}
                                    <span>
                                      {new Date(lastRun.createdAt).toLocaleDateString("fr-FR", {
                                        day: "numeric",
                                        month: "short",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                    <span>·</span>
                                    <span>
                                      {formatDuration(lastRun.startedAt, lastRun.completedAt)}
                                    </span>
                                    {lastRun.processed != null && (
                                      <>
                                        <span>·</span>
                                        <span>{lastRun.processed} traités</span>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => launchScript(script.id)}
                                disabled={isRunning || isLaunching || launching !== null}
                                aria-label={`Lancer ${script.label}`}
                              >
                                {isLaunching ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : isRunning ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Play className="w-3.5 h-3.5" aria-hidden="true" />
                                )}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* History */}
          <div>
            <h2 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              Historique
            </h2>
            {historyJobs.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <History
                    className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-muted-foreground">Aucune synchronisation lancée</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="px-4 py-3 font-medium text-muted-foreground">Date</th>
                          <th className="px-4 py-3 font-medium text-muted-foreground">Script</th>
                          <th className="px-4 py-3 font-medium text-muted-foreground">Statut</th>
                          <th className="px-4 py-3 font-medium text-muted-foreground">Durée</th>
                          <th className="px-4 py-3 font-medium text-muted-foreground">
                            Traitement
                          </th>
                          <th className="px-4 py-3 font-medium text-muted-foreground w-10" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {historyJobs.map((job) => {
                          const status = STATUS_CONFIG[job.status] || STATUS_CONFIG.PENDING;
                          const hasError = !!job.error;
                          const isErrorOpen = expandedErrors.has(job.id);

                          return (
                            <tr
                              key={job.id}
                              className={`hover:bg-muted/30 transition-colors ${hasError && isErrorOpen ? "bg-red-50/30" : ""}`}
                            >
                              <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap tabular-nums">
                                {new Date(job.createdAt).toLocaleDateString("fr-FR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </td>
                              <td className="px-4 py-3 font-medium">{scriptLabel(job.script)}</td>
                              <td className="px-4 py-3">
                                <Badge variant="outline" className={status!.className}>
                                  {status!.label}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground text-xs tabular-nums">
                                {formatDuration(job.startedAt, job.completedAt)}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground text-xs tabular-nums">
                                {job.processed != null
                                  ? `${job.processed}${job.total ? `/${job.total}` : ""}`
                                  : "—"}
                              </td>
                              <td className="px-4 py-3">
                                {hasError && (
                                  <button
                                    onClick={() => toggleError(job.id)}
                                    className="p-1 rounded text-muted-foreground hover:text-red-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                                    aria-expanded={isErrorOpen}
                                    aria-label={isErrorOpen ? "Masquer l'erreur" : "Voir l'erreur"}
                                  >
                                    {isErrorOpen ? (
                                      <ChevronDown className="w-4 h-4" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4" />
                                    )}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Expanded error details rendered outside table for proper layout */}
                  {historyJobs
                    .filter((job) => job.error && expandedErrors.has(job.id))
                    .map((job) => (
                      <div
                        key={`error-${job.id}`}
                        className="px-4 py-3 border-t border-red-100 bg-red-50/40"
                      >
                        <p className="text-xs font-medium text-red-700 mb-1">
                          Erreur — {scriptLabel(job.script)}
                        </p>
                        <pre className="text-xs text-red-800/80 whitespace-pre-wrap font-mono leading-relaxed max-h-40 overflow-y-auto">
                          {job.error}
                        </pre>
                      </div>
                    ))}
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
