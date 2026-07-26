"use client";

import { Fragment, useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDateShort } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  AFFAIR_STATUS_LABELS,
  AFFAIR_STATUS_COLORS,
  AFFAIR_CATEGORY_LABELS,
  INVOLVEMENT_LABELS,
} from "@/config/labels";
import {
  Loader2,
  Search,
  GitMerge,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  X,
} from "lucide-react";
import type { AffairStatus, AffairCategory, Involvement } from "@/generated/prisma";

interface DuplicateAffair {
  id: string;
  title: string;
  status: string;
  category: string;
  involvement: string;
  publicationStatus: string;
  decisionRefs?: Array<{ ecli: string | null; pourvoiNumber: string | null }>;
  factsDate: string | null;
  startDate: string | null;
  verdictDate: string | null;
  sourceCount: number;
  sources: { url: string; title: string; publisher: string }[];
}

interface DuplicateGroup {
  score: number;
  reasons: string[];
  affairs: DuplicateAffair[];
}

interface DuplicateDetectorProps {
  politicianId: string;
  affairCount: number;
}

const PUB_STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-amber-50 text-amber-700 border-amber-200",
  PUBLISHED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  ARCHIVED: "bg-slate-50 text-slate-500 border-slate-200",
  EXCLUDED: "bg-gray-50 text-gray-500 border-gray-200",
};

const PUB_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  PUBLISHED: "Publié",
  REJECTED: "Rejeté",
  ARCHIVED: "Archivé",
  EXCLUDED: "Exclu",
};

function scoreColor(score: number): string {
  if (score >= 80) return "text-red-600 bg-red-50 border-red-200";
  if (score >= 60) return "text-orange-600 bg-orange-50 border-orange-200";
  return "text-amber-600 bg-amber-50 border-amber-200";
}

function scoreBarColor(score: number): string {
  if (score >= 80) return "bg-red-500";
  if (score >= 60) return "bg-orange-500";
  return "bg-amber-500";
}

function AffairCard({
  affair,
  isPrimary,
  onSelect,
}: {
  affair: DuplicateAffair;
  isPrimary?: boolean;
  onSelect?: () => void;
}) {
  return (
    <div
      className={`flex-1 min-w-0 rounded-lg border p-4 transition-all ${
        isPrimary
          ? "border-blue-300 bg-blue-50/40 ring-2 ring-blue-200"
          : "border-border bg-card hover:border-muted-foreground/30"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <h4 className="font-semibold text-sm leading-snug line-clamp-2 flex-1">{affair.title}</h4>
        <Link
          href={`/admin/affaires/${affair.id}`}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          title="Voir la fiche"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <Badge
          variant="secondary"
          className={`text-[10px] ${AFFAIR_STATUS_COLORS[affair.status as AffairStatus] || ""}`}
        >
          {AFFAIR_STATUS_LABELS[affair.status as AffairStatus] || affair.status}
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {AFFAIR_CATEGORY_LABELS[affair.category as AffairCategory] || affair.category}
        </Badge>
        <Badge
          variant="outline"
          className={`text-[10px] ${PUB_STATUS_STYLES[affair.publicationStatus] || ""}`}
        >
          {PUB_STATUS_LABELS[affair.publicationStatus] || affair.publicationStatus}
        </Badge>
      </div>

      {/* Details grid */}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">Implication</dt>
        <dd className="font-medium">
          {INVOLVEMENT_LABELS[affair.involvement as Involvement] || affair.involvement}
        </dd>

        <dt className="text-muted-foreground">Faits</dt>
        <dd className="font-medium font-mono">{formatDateShort(affair.factsDate)}</dd>

        <dt className="text-muted-foreground">Verdict</dt>
        <dd className="font-medium font-mono">{formatDateShort(affair.verdictDate)}</dd>

        <dt className="text-muted-foreground">Sources</dt>
        <dd className="font-medium">{affair.sourceCount}</dd>

        {(affair.decisionRefs ?? []).map((ref, index) => (
          <Fragment key={`${ref.ecli ?? ""}-${ref.pourvoiNumber ?? ""}-${index}`}>
            <dt className="text-muted-foreground">Décision</dt>
            <dd className="font-mono text-[10px] break-all">
              {[ref.pourvoiNumber, ref.ecli].filter(Boolean).join(" · ") || "sans référence"}
            </dd>
          </Fragment>
        ))}
      </dl>

      {/* Sources list */}
      {affair.sources.length > 0 && (
        <div className="mt-3 pt-2 border-t">
          <p className="text-[10px] text-muted-foreground mb-1">Sources :</p>
          <ul className="space-y-0.5">
            {affair.sources.slice(0, 3).map((s, i) => (
              <li key={i} className="text-[10px] text-muted-foreground truncate">
                <span className="font-medium text-foreground/70">{s.publisher}</span>
                {" — "}
                {s.title}
              </li>
            ))}
            {affair.sources.length > 3 && (
              <li className="text-[10px] text-muted-foreground">
                + {affair.sources.length - 3} autre(s)
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Select as primary button */}
      {onSelect && (
        <button
          onClick={onSelect}
          className={`mt-3 w-full text-xs py-1.5 rounded-md border transition-colors ${
            isPrimary
              ? "bg-blue-100 border-blue-300 text-blue-700 font-medium"
              : "bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          {isPrimary ? "✓ Affaire principale" : "Définir comme principale"}
        </button>
      )}
    </div>
  );
}

function DuplicateGroupCard({
  group,
  onMerge,
  onDelete,
  onDismiss,
}: {
  group: DuplicateGroup;
  onMerge: (primaryId: string, secondaryId: string) => void;
  onDelete: (id: string) => void;
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(group.score >= 70);
  const [primaryId, setPrimaryId] = useState<string>(group.affairs[0]!.id);
  const [merging, setMerging] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const secondaryId = group.affairs.find((a) => a.id !== primaryId)!.id;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Group header — clickable */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        {/* Score indicator */}
        <div className="shrink-0 flex flex-col items-center gap-1">
          <span
            className={`text-sm font-bold tabular-nums px-2 py-0.5 rounded-md border ${scoreColor(group.score)}`}
          >
            {group.score}%
          </span>
          <div className="w-10 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${scoreBarColor(group.score)}`}
              style={{ width: `${group.score}%` }}
            />
          </div>
        </div>

        {/* Titles preview */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium truncate">{group.affairs[0]!.title}</span>
            <span className="text-muted-foreground shrink-0">↔</span>
            <span className="font-medium truncate">{group.affairs[1]!.title}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {group.reasons.map((r, i) => (
              <span
                key={i}
                className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded"
              >
                {r}
              </span>
            ))}
          </div>
        </div>

        {/* Expand chevron */}
        <span className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>

      {/* Expanded comparison */}
      {expanded && (
        <div className="border-t px-4 py-4 bg-muted/10">
          {/* Side-by-side cards */}
          <div className="flex gap-3">
            {group.affairs.map((affair) => (
              <AffairCard
                key={affair.id}
                affair={affair}
                isPrimary={affair.id === primaryId}
                onSelect={() => setPrimaryId(affair.id)}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-dashed">
            <p className="text-xs text-muted-foreground max-w-xs">
              Fusionner conserve l&apos;affaire principale et y transfère les sources de
              l&apos;autre.
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onDismiss}
                className="text-muted-foreground"
              >
                <X className="w-3.5 h-3.5 mr-1" />
                Ignorer
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => setShowDeleteConfirm(secondaryId)}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Supprimer
              </Button>
              <Button
                size="sm"
                disabled={merging}
                onClick={() => {
                  setMerging(true);
                  onMerge(primaryId, secondaryId);
                }}
              >
                {merging ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <GitMerge className="w-3.5 h-3.5 mr-1" />
                )}
                Fusionner
              </Button>
            </div>
          </div>

          <ConfirmDialog
            open={showDeleteConfirm !== null}
            onOpenChange={(open) => !open && setShowDeleteConfirm(null)}
            onConfirm={() => {
              if (showDeleteConfirm) {
                onDelete(showDeleteConfirm);
                setShowDeleteConfirm(null);
              }
            }}
            title="Supprimer l'affaire"
            description={`Supprimer définitivement « ${group.affairs.find((a) => a.id === showDeleteConfirm)?.title} » ? Les sources associées seront également supprimées.`}
            confirmLabel="Supprimer"
            variant="destructive"
          />
        </div>
      )}
    </div>
  );
}

export function DuplicateDetector({ politicianId, affairCount }: DuplicateDetectorProps) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);

  const detect = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch(`/api/admin/politiques/${politicianId}/detect-duplicates`);
      if (!res.ok) throw new Error("Erreur API");
      const data = await res.json();
      setGroups(data.groups);
      setDismissed(new Set());
      setState("done");
    } catch {
      setState("error");
    }
  }, [politicianId]);

  const handleMerge = useCallback(
    async (primaryId: string, secondaryId: string) => {
      setActionLoading(true);
      try {
        const res = await fetch("/api/admin/affaires/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ primaryId, secondaryId }),
        });
        if (res.ok) {
          // Re-detect after merge
          await detect();
          router.refresh();
        }
      } finally {
        setActionLoading(false);
      }
    },
    [detect, router]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setActionLoading(true);
      try {
        const res = await fetch(`/api/admin/affaires/${id}`, { method: "DELETE" });
        if (res.ok) {
          await detect();
          router.refresh();
        }
      } finally {
        setActionLoading(false);
      }
    },
    [detect, router]
  );

  const visibleGroups = groups.filter((_, i) => !dismissed.has(i));

  if (affairCount < 2) return null;

  return (
    <Card>
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-100 to-orange-100 border border-amber-200 flex items-center justify-center">
            <Search className="w-4 h-4 text-amber-700" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Détection de doublons</h3>
            <p className="text-xs text-muted-foreground">
              {state === "done"
                ? visibleGroups.length > 0
                  ? `${visibleGroups.length} doublon(s) potentiel(s) détecté(s)`
                  : "Aucun doublon détecté"
                : `Analyse des ${affairCount} affaires par similarité`}
            </p>
          </div>
        </div>

        <Button
          variant={state === "done" && visibleGroups.length === 0 ? "outline" : "default"}
          size="sm"
          onClick={detect}
          disabled={state === "loading" || actionLoading}
        >
          {state === "loading" ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Analyse…
            </>
          ) : state === "done" && visibleGroups.length === 0 ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
              Relancer
            </>
          ) : (
            <>
              <Search className="w-3.5 h-3.5 mr-1.5" />
              {state === "done" ? "Relancer" : "Analyser"}
            </>
          )}
        </Button>
      </div>

      {/* Results */}
      {state === "done" && visibleGroups.length > 0 && (
        <CardContent className="pt-4 space-y-3">
          {visibleGroups.map((group) => {
            // Find original index for dismissal tracking
            const originalIndex = groups.indexOf(group);
            return (
              <DuplicateGroupCard
                key={`${group.affairs[0]!.id}-${group.affairs[1]!.id}`}
                group={group}
                onMerge={handleMerge}
                onDelete={handleDelete}
                onDismiss={() => setDismissed((prev) => new Set([...prev, originalIndex]))}
              />
            );
          })}
        </CardContent>
      )}

      {state === "error" && (
        <CardContent className="pt-4">
          <p className="text-sm text-red-600">Erreur lors de l&apos;analyse. Réessayez.</p>
        </CardContent>
      )}
    </Card>
  );
}
