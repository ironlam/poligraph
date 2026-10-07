"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Search,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShieldX,
  RotateCcw,
  Trash2,
  ExternalLink,
} from "lucide-react";

interface RejectionItem {
  id: string;
  politicianName: string;
  confidenceScore: number;
  rejectedAt: string;
  detectedAffair: {
    title: string;
    category?: string;
    description?: string;
  };
  article: {
    id: string;
    title: string;
    feedSource: string;
    publishedAt: string;
    url: string;
  };
  politician: {
    id: string;
    fullName: string;
    slug: string;
    photoUrl: string | null;
    blobPhotoUrl: string | null;
  } | null;
}

interface ApiResponse {
  data: RejectionItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const DAY_TABS = [
  { key: "7", label: "7 jours" },
  { key: "30", label: "30 jours" },
  { key: "all", label: "Tout" },
] as const;

function confidenceBadgeClass(score: number): string {
  if (score < 30) return "bg-red-50 text-red-700 border-red-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

export default function AdminPressRejectionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [recoveringId, setRecoveringId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Read state from URL
  const searchQuery = searchParams.get("search") || "";
  const daysFilter = searchParams.get("days") || "30";
  const currentPage = parseInt(searchParams.get("page") || "1", 10);

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      if (!("page" in updates)) params.set("page", "1");
      router.push(`/admin/press/rejections?${params.toString()}`);
    },
    [router, searchParams]
  );

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (searchQuery) params.set("search", searchQuery);
    if (daysFilter && daysFilter !== "all") params.set("days", daysFilter);
    params.set("page", String(currentPage));
    params.set("limit", "50");

    try {
      const res = await fetch(`/api/admin/press/rejections?${params.toString()}`);
      if (res.ok) {
        const json: ApiResponse = await res.json();
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, [searchQuery, daysFilter, currentPage]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Bulk delete
  async function handleBulkDelete() {
    if (selected.size === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/admin/press/rejections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      if (res.ok) {
        setSelected(new Set());
        fetchData();
      }
    } finally {
      setBulkLoading(false);
    }
  }

  // Recover single rejection
  async function handleRecover(rejectionId: string) {
    setRecoveringId(rejectionId);
    try {
      const res = await fetch("/api/admin/press/rejections/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionId }),
      });
      if (res.ok) {
        const result = await res.json();
        // Remove from selection if present
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(rejectionId);
          return next;
        });
        fetchData();
        // Brief notification — the affair link will appear in the table refresh
        console.log(`Affair created: ${result.affairId}`);
      }
    } finally {
      setRecoveringId(null);
    }
  }

  const rejections = data?.data || [];
  const pagination = data?.pagination;
  const allSelected = rejections.length > 0 && rejections.every((r) => selected.has(r.id));

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rejections.map((r) => r.id)));
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
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-display font-bold tracking-tight">Rejets presse</h1>
          {pagination && (
            <span className="text-sm text-muted-foreground">
              {pagination.total} rejet{pagination.total > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Date filter tabs */}
      <div className="flex gap-1 border-b border-border" role="tablist" aria-label="Période">
        {DAY_TABS.map((tab) => {
          const isActive = daysFilter === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => updateParams({ days: tab.key })}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                isActive
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Search bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Rechercher par politicien..."
            defaultValue={searchQuery}
            aria-label="Rechercher par politicien"
            onChange={(e) => {
              const val = e.target.value;
              clearTimeout(
                (window as unknown as Record<string, ReturnType<typeof setTimeout>>).__rejSearch
              );
              (window as unknown as Record<string, ReturnType<typeof setTimeout>>).__rejSearch =
                setTimeout(() => {
                  updateParams({ search: val });
                }, 300);
            }}
            className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <Card className="border-red-200 bg-red-50/50" role="status" aria-live="polite">
          <CardContent className="p-3 flex items-center gap-4">
            <span className="text-sm font-medium">
              {selected.size} sélectionné{selected.size > 1 ? "s" : ""}
            </span>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={bulkLoading}
            >
              {bulkLoading && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              <Trash2 className="w-3 h-3 mr-1" />
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

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center">
              <Loader2 className="w-6 h-6 text-muted-foreground animate-spin mx-auto" />
            </div>
          ) : rejections.length === 0 ? (
            <div className="p-12 text-center">
              <ShieldX
                className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3"
                aria-hidden="true"
              />
              <p className="text-sm text-muted-foreground">
                {searchQuery ? "Aucun rejet pour cette recherche" : "Aucun rejet sur cette période"}
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
                    <th className="px-4 py-3 font-medium text-muted-foreground">Titre détecté</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Confiance</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Source</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rejections.map((rejection) => (
                    <tr
                      key={rejection.id}
                      className={`hover:bg-muted/30 transition-colors ${selected.has(rejection.id) ? "bg-primary/5" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleOne(rejection.id)}
                          aria-label={`Sélectionner ${rejection.detectedAffair.title}`}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {selected.has(rejection.id) ? (
                            <CheckSquare className="w-4 h-4" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        {rejection.politician ? (
                          <Link
                            href={`/admin/politiques/${rejection.politician.id}`}
                            className="flex items-center gap-2 hover:text-foreground"
                            prefetch={false}
                          >
                            <PoliticianAvatar
                              photoUrl={rejection.politician.photoUrl}
                              blobPhotoUrl={rejection.politician.blobPhotoUrl}
                              fullName={rejection.politician.fullName}
                              size="sm"
                              className="w-6 h-6 text-[10px]"
                            />
                            <span className="truncate max-w-[120px]">
                              {rejection.politician.fullName}
                            </span>
                          </Link>
                        ) : (
                          <span className="text-muted-foreground italic truncate max-w-[120px]">
                            {rejection.politicianName}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="truncate max-w-[250px] block"
                          title={rejection.detectedAffair.title}
                        >
                          {rejection.detectedAffair.title}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={confidenceBadgeClass(rejection.confidenceScore)}
                        >
                          {rejection.confidenceScore}%
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={rejection.article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground truncate max-w-[150px]"
                          title={rejection.article.title}
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          {rejection.article.feedSource}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        {new Date(rejection.rejectedAt).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => handleRecover(rejection.id)}
                          disabled={recoveringId === rejection.id || !rejection.politician}
                          title={
                            !rejection.politician
                              ? "Politicien non lié — récupération impossible"
                              : "Créer une affaire brouillon"
                          }
                        >
                          {recoveringId === rejection.id ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3 h-3 mr-1" />
                          )}
                          Récupérer
                        </Button>
                      </td>
                    </tr>
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

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        onConfirm={() => {
          setShowDeleteConfirm(false);
          handleBulkDelete();
        }}
        title="Supprimer les rejets"
        description={`Supprimer définitivement ${selected.size} rejet${selected.size > 1 ? "s" : ""} ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="destructive"
      />
    </div>
  );
}
