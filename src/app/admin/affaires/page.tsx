"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AFFAIR_STATUS_LABELS,
  AFFAIR_STATUS_COLORS,
  AFFAIR_CATEGORY_LABELS,
} from "@/config/labels";
import { PromptDialog } from "@/components/ui/prompt-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Plus,
  Search,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Scale,
} from "lucide-react";
import { AffairesPageSkeleton } from "./_components/AffairesPageSkeleton";
import {
  buildApplyAiPayload,
  buildBulkPayload,
  summarizeModerationResult,
} from "@/lib/admin/moderation-payload";
import type { PublicationStatus } from "@/generated/prisma";

interface AffairItem {
  id: string;
  title: string;
  status: string;
  category: string;
  publicationStatus: PublicationStatus;
  createdAt: string;
  politician: {
    id: string;
    fullName: string;
    slug: string;
    photoUrl: string | null;
  };
  sources: { id: string; sourceType: string }[];
  moderationReviews: {
    id: string;
    recommendation: "PUBLISH" | "REJECT" | "NEEDS_REVIEW";
    confidence: number;
    reasoning: string;
    suggestedTitle: string | null;
    suggestedDescription: string | null;
    suggestedStatus: string | null;
    suggestedCategory: string | null;
    issues: { type: string }[] | null;
    duplicateOfId: string | null;
  }[];
}

interface ApiResponse {
  data: AffairItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  counts: { all: number; DRAFT: number; PUBLISHED: number; REJECTED: number };
}

const TABS: { key: string; label: string; status: PublicationStatus | null }[] = [
  { key: "all", label: "Toutes", status: null },
  { key: "DRAFT", label: "À modérer", status: "DRAFT" },
  { key: "PUBLISHED", label: "Publiées", status: "PUBLISHED" },
  { key: "REJECTED", label: "Rejetées", status: "REJECTED" },
];

const PUB_STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-amber-50 text-amber-700 border-amber-200",
  PUBLISHED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
};

const AI_REC_STYLES: Record<string, { bg: string; label: string }> = {
  PUBLISH: { bg: "bg-emerald-100 text-emerald-800 border-emerald-300", label: "IA: Publier" },
  REJECT: { bg: "bg-red-100 text-red-800 border-red-300", label: "IA: Rejeter" },
  NEEDS_REVIEW: { bg: "bg-amber-100 text-amber-800 border-amber-300", label: "IA: À vérifier" },
};

export default function AdminAffairsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showRejectPrompt, setShowRejectPrompt] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [applyingAI, setApplyingAI] = useState(false);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Read state from URL
  const activeTab = searchParams.get("status") || "all";
  const searchQuery = searchParams.get("search") || "";
  const currentPage = parseInt(searchParams.get("page") || "1", 10);
  const categoryFilter = searchParams.get("category") || "";
  const filterParam = searchParams.get("filter") || "";

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      // Reset page when changing filters
      if (!("page" in updates)) params.set("page", "1");
      router.push(`/admin/affaires?${params.toString()}`);
    },
    [router, searchParams]
  );

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (activeTab !== "all") params.set("publicationStatus", activeTab);
    if (searchQuery) params.set("search", searchQuery);
    if (categoryFilter) params.set("category", categoryFilter);
    if (filterParam === "no-ecli") params.set("hasEcli", "false");
    params.set("page", String(currentPage));
    params.set("limit", "50");

    try {
      const res = await fetch(`/api/admin/affaires?${params.toString()}`);
      if (res.ok) {
        const json: ApiResponse = await res.json();
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, [activeTab, searchQuery, categoryFilter, currentPage, filterParam]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Bulk actions
  async function handleBulk(action: "publish" | "reject" | "delete", rejectionReason?: string) {
    if (selected.size === 0) return;
    setBulkLoading(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/affaires/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBulkPayload(action, [...selected], rejectionReason)),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setFeedback(summarizeModerationResult(data));
        setSelected(new Set());
        fetchData();
      } else {
        setFeedback({ ok: false, message: "Échec de l'action groupée. Réessayez." });
      }
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleApplyAI(recommendation: "PUBLISH" | "REJECT") {
    const payload = buildApplyAiPayload(affairs, recommendation);
    if (payload.ids.length === 0) return;

    setApplyingAI(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/affaires/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setFeedback(summarizeModerationResult(data));
        fetchData();
      } else {
        setFeedback({ ok: false, message: "Échec de l'application des recommandations IA." });
      }
    } finally {
      setApplyingAI(false);
    }
  }

  async function handleEnrich(affairId: string) {
    setEnrichingId(affairId);
    try {
      const res = await fetch("/api/admin/affaires/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ affairId }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.enriched) {
          fetchData();
        }
      }
    } finally {
      setEnrichingId(null);
    }
  }

  const affairs = data?.data || [];
  const pagination = data?.pagination;
  const counts = data?.counts || { all: 0, DRAFT: 0, PUBLISHED: 0, REJECTED: 0 };
  const allSelected = affairs.length > 0 && affairs.every((a) => selected.has(a.id));

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(affairs.map((a) => a.id)));
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold tracking-tight">Affaires judiciaires</h1>
        <Button asChild>
          <Link href="/admin/affaires/nouveau">
            <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
            Nouvelle affaire
          </Link>
        </Button>
      </div>

      {/* Moderation feedback (surfaces publish-guard failures, #364) */}
      {feedback && (
        <div
          role={feedback.ok ? "status" : "alert"}
          aria-live="polite"
          className={`flex items-start justify-between gap-3 rounded-lg border p-3 text-sm ${
            feedback.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-300 bg-amber-50 text-amber-900"
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Masquer le message"
            className="shrink-0 opacity-60 hover:opacity-100"
          >
            Fermer
          </button>
        </div>
      )}

      {/* Tabs */}
      <div
        className="flex gap-1 border-b border-border"
        role="tablist"
        aria-label="Statut de publication"
      >
        {TABS.map((tab) => {
          const count =
            tab.key === "all" ? counts.all : counts[tab.key as keyof typeof counts] || 0;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => updateParams({ status: tab.key === "all" ? "" : tab.key })}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                isActive
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              {tab.label}
              <span
                className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                  isActive ? "bg-foreground/10" : "bg-muted"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Rechercher par titre ou politicien..."
            defaultValue={searchQuery}
            aria-label="Rechercher par titre ou politicien"
            onChange={(e) => {
              const val = e.target.value;
              if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
              searchTimerRef.current = setTimeout(() => {
                updateParams({ search: val });
              }, 300);
            }}
            className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => updateParams({ category: e.target.value })}
          className="text-sm bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring/50"
          aria-label="Filtrer par catégorie"
        >
          <option value="">Toutes catégories</option>
          {Object.entries(AFFAIR_CATEGORY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <Card className="border-primary/30 bg-primary/5" role="status" aria-live="polite">
          <CardContent className="p-3 flex items-center gap-4">
            <span className="text-sm font-medium">
              {selected.size} sélectionnée{selected.size > 1 ? "s" : ""}
            </span>
            <Button size="sm" onClick={() => handleBulk("publish")} disabled={bulkLoading}>
              {bulkLoading && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              Publier
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowRejectPrompt(true)}
              disabled={bulkLoading}
            >
              Rejeter
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={bulkLoading}
            >
              Supprimer
            </Button>
            <button
              className="text-sm text-muted-foreground hover:text-foreground ml-auto"
              onClick={() => setSelected(new Set())}
            >
              Tout désélectionner
            </button>
          </CardContent>
        </Card>
      )}

      {/* AI moderation actions */}
      {activeTab === "DRAFT" && affairs.some((a) => a.moderationReviews.length > 0) && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-3 flex items-center gap-4 flex-wrap">
            <span className="text-sm font-medium text-blue-900">Recommandations IA</span>
            {(() => {
              const reviews = affairs.flatMap((a) => a.moderationReviews);
              const publishCount = reviews.filter((r) => r.recommendation === "PUBLISH").length;
              const rejectCount = reviews.filter((r) => r.recommendation === "REJECT").length;
              const reviewCount = reviews.filter((r) => r.recommendation === "NEEDS_REVIEW").length;
              return (
                <>
                  {publishCount > 0 && (
                    <Button
                      size="sm"
                      onClick={() => handleApplyAI("PUBLISH")}
                      disabled={applyingAI}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      {applyingAI && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                      Publier {publishCount} recommandées
                    </Button>
                  )}
                  {rejectCount > 0 && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleApplyAI("REJECT")}
                      disabled={applyingAI}
                    >
                      Rejeter {rejectCount} recommandées
                    </Button>
                  )}
                  {reviewCount > 0 && (
                    <span className="text-xs text-amber-700">
                      + {reviewCount} à vérifier manuellement
                    </span>
                  )}
                </>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <AffairesPageSkeleton />
          ) : affairs.length === 0 ? (
            <div className="p-12 text-center">
              <Scale
                className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3"
                aria-hidden="true"
              />
              <p className="text-sm text-muted-foreground">
                {searchQuery || categoryFilter
                  ? "Aucune affaire pour ces filtres"
                  : "Aucune affaire enregistrée"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-3 w-10">
                      <button
                        onClick={toggleAll}
                        aria-label="Tout sélectionner"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {allSelected ? (
                          <CheckSquare className="w-4 h-4" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Politicien</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Titre</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Catégorie</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">
                      Statut juridique
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Publication</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Sources</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {affairs.map((affair) => (
                    <AffairTableRow
                      key={affair.id}
                      affair={affair}
                      isSelected={selected.has(affair.id)}
                      onToggle={() => toggleOne(affair.id)}
                      onEnrich={() => handleEnrich(affair.id)}
                      enrichingId={enrichingId}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {pagination.total} résultat{pagination.total > 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateParams({ page: String(currentPage - 1) })}
              disabled={currentPage <= 1}
              className="p-2 rounded-md hover:bg-muted disabled:opacity-50 disabled:pointer-events-none"
              aria-label="Page précédente"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-muted-foreground">
              {currentPage} / {pagination.totalPages}
            </span>
            <button
              onClick={() => updateParams({ page: String(currentPage + 1) })}
              disabled={currentPage >= pagination.totalPages}
              className="p-2 rounded-md hover:bg-muted disabled:opacity-50 disabled:pointer-events-none"
              aria-label="Page suivante"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      <PromptDialog
        open={showRejectPrompt}
        onOpenChange={setShowRejectPrompt}
        onSubmit={(reason) => {
          setShowRejectPrompt(false);
          handleBulk("reject", reason);
        }}
        title="Motif de rejet"
        description={`${selected.size} affaire${selected.size > 1 ? "s" : ""} sélectionnée${selected.size > 1 ? "s" : ""}`}
        placeholder="Raison du rejet..."
        submitLabel="Rejeter"
        variant="destructive"
      />
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        onConfirm={() => {
          setShowDeleteConfirm(false);
          handleBulk("delete");
        }}
        title="Supprimer les affaires"
        description={`Supprimer définitivement ${selected.size} affaire${selected.size > 1 ? "s" : ""} ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="destructive"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: affair table row
// ---------------------------------------------------------------------------

function AffairTableRow({
  affair,
  isSelected,
  onToggle,
  onEnrich,
  enrichingId,
}: {
  affair: AffairItem;
  isSelected: boolean;
  onToggle: () => void;
  onEnrich: () => void;
  enrichingId: string | null;
}) {
  return (
    <tr className={`hover:bg-muted/30 transition-colors ${isSelected ? "bg-primary/5" : ""}`}>
      <td className="px-4 py-3">
        <button
          onClick={onToggle}
          aria-label={`Sélectionner ${affair.title}`}
          className="text-muted-foreground hover:text-foreground"
        >
          {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
        </button>
      </td>
      <td className="px-4 py-3">
        <Link
          href={`/admin/politiques/${affair.politician.id}`}
          className="flex items-center gap-2 hover:text-foreground"
        >
          <PoliticianAvatar
            photoUrl={affair.politician.photoUrl}
            fullName={affair.politician.fullName}
            size="sm"
            className="w-6 h-6 text-[10px]"
          />
          <span className="truncate max-w-[120px]">{affair.politician.fullName}</span>
        </Link>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/affaires/${affair.id}`}
            className="font-medium hover:underline truncate max-w-[200px] block"
          >
            {affair.moderationReviews[0]?.suggestedTitle || affair.title}
          </Link>
          {affair.moderationReviews[0] &&
            (() => {
              const rec = affair.moderationReviews[0];
              const style = AI_REC_STYLES[rec.recommendation];
              return style ? (
                <Badge
                  variant="outline"
                  className={`text-[10px] shrink-0 ${style.bg}`}
                  title={rec.reasoning}
                >
                  {style.label}
                  <span className="ml-1 opacity-60">{rec.confidence}%</span>
                </Badge>
              ) : null;
            })()}
        </div>
        {affair.moderationReviews[0]?.suggestedTitle && (
          <span className="text-xs text-muted-foreground line-through block truncate max-w-[200px]">
            {affair.title}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-muted-foreground text-xs">
        {AFFAIR_CATEGORY_LABELS[affair.category as keyof typeof AFFAIR_CATEGORY_LABELS]}
      </td>
      <td className="px-4 py-3">
        <Badge className={AFFAIR_STATUS_COLORS[affair.status as keyof typeof AFFAIR_STATUS_COLORS]}>
          {AFFAIR_STATUS_LABELS[affair.status as keyof typeof AFFAIR_STATUS_LABELS]}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <Badge variant="outline" className={PUB_STATUS_STYLES[affair.publicationStatus] || ""}>
          {affair.publicationStatus}
        </Badge>
      </td>
      <td className="px-4 py-3 text-center text-muted-foreground">
        <div className="flex items-center justify-center gap-1">
          {affair.sources.length}
          {affair.moderationReviews[0]?.recommendation === "REJECT" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              title="Enrichir via recherche web"
              onClick={onEnrich}
              disabled={enrichingId === affair.id}
            >
              {enrichingId === affair.id ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Search className="w-3 h-3" />
              )}
            </Button>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
        {new Date(affair.createdAt).toLocaleDateString("fr-FR")}
      </td>
    </tr>
  );
}
