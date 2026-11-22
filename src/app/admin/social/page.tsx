"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { safeJsonParse } from "@/lib/api/safe-json";

// ─── Types ───────────────────────────────────────────────

interface SocialPost {
  id: string;
  category: string;
  /** Bluesky text, empty when the post does not go to Bluesky. */
  content: string;
  twitterContent: string | null;
  link: string | null;
  entityId: string | null;
  status: string;
  blueskyUrl: string | null;
  twitterUrl: string | null;
  blueskyError: string | null;
  twitterError: string | null;
  error: string | null;
  postedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type TabStatus = "PENDING_REVIEW" | "APPROVED" | "POSTED" | "REJECTED";

type TextField = "content" | "twitterContent";
type PendingEdits = Partial<Record<TextField, string>>;

// ─── Constants ──────────────────────────────────────────

const TABS: { label: string; status: TabStatus }[] = [
  { label: "En attente", status: "PENDING_REVIEW" },
  { label: "Approuvés", status: "APPROVED" },
  { label: "Postés", status: "POSTED" },
  { label: "Rejetés", status: "REJECTED" },
];

const CATEGORY_COLORS: Record<string, string> = {
  affaires: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  votes: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  elections: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  methodo: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
  factchecks: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  profil: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  chiffres: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  presence: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
};

const TAB_STATUS_STYLES: Record<TabStatus, string> = {
  PENDING_REVIEW: "bg-amber-50 text-amber-700 border-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  POSTED: "bg-blue-50 text-blue-700 border-blue-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
};

// ─── Helpers ────────────────────────────────────────────

function charCountColor(length: number, max: number): string {
  if (length >= max) return "text-red-600";
  if (length >= max - 50) return "text-amber-600";
  return "text-green-600";
}

const TEXT_FIELDS: { field: TextField; label: string; max: number }[] = [
  { field: "content", label: "Bluesky", max: 300 },
  { field: "twitterContent", label: "X", max: 280 },
];

/** Network diagnostics are stored as JSON by the MCP server; older rows hold plain text. */
function describeNetworkError(raw: string): string {
  const parsed = safeJsonParse<{ message?: unknown; action?: unknown }>(raw);
  if (parsed.success && parsed.data && typeof parsed.data.message === "string") {
    const action = typeof parsed.data.action === "string" ? ` ${parsed.data.action}` : "";
    return `${parsed.data.message}.${action}`;
  }
  return raw;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Component ──────────────────────────────────────────

export default function AdminSocialPage() {
  const [activeTab, setActiveTab] = useState<TabStatus>("PENDING_REVIEW");
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [editedContents, setEditedContents] = useState<Record<string, PendingEdits>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchPosts = useCallback(async (status: TabStatus) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/social?status=${status}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data: SocialPost[] = await res.json();
        setPosts(data);
      } else {
        toast.error("Erreur lors du chargement des posts");
      }
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts(activeTab);
  }, [activeTab, fetchPosts]);

  function handleTabChange(status: TabStatus) {
    setActiveTab(status);
    setEditedContents({});
  }

  function handleContentChange(postId: string, field: TextField, value: string) {
    setEditedContents((prev) => ({ ...prev, [postId]: { ...prev[postId], [field]: value } }));
  }

  function storedText(post: SocialPost, field: TextField): string {
    return post[field] ?? "";
  }

  function currentText(post: SocialPost, field: TextField): string {
    return editedContents[post.id]?.[field] ?? storedText(post, field);
  }

  function isEdited(post: SocialPost): boolean {
    return TEXT_FIELDS.some(({ field }) => currentText(post, field) !== storedText(post, field));
  }

  async function handleSave(post: SocialPost) {
    if (!isEdited(post)) return;
    // The X text is sent only when it changed: an empty value removes the X version.
    const payload: { content: string; twitterContent?: string | null } = {
      content: currentText(post, "content"),
    };
    if (currentText(post, "twitterContent") !== storedText(post, "twitterContent")) {
      payload.twitterContent = currentText(post, "twitterContent") || null;
    }

    setActionLoading(post.id);
    try {
      const res = await fetch(`/api/admin/social/${post.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("Post sauvegardé");
        setEditedContents((prev) => {
          const next = { ...prev };
          delete next[post.id];
          return next;
        });
        await fetchPosts(activeTab);
      } else {
        const err = await res.json();
        toast.error(err.error || "Erreur lors de la sauvegarde");
      }
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleApprove(postId: string) {
    setActionLoading(postId);
    try {
      const res = await fetch(`/api/admin/social/${postId}/approve`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Post approuvé");
        await fetchPosts(activeTab);
      } else {
        const err = await res.json();
        toast.error(err.error || "Erreur lors de l'approbation");
      }
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(postId: string) {
    setActionLoading(postId);
    try {
      const res = await fetch(`/api/admin/social/${postId}/reject`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Post rejeté");
        await fetchPosts(activeTab);
      } else {
        const err = await res.json();
        toast.error(err.error || "Erreur lors du rejet");
      }
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Posts sociaux</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Relecture, édition et validation des posts. Approuver un post approuve ses deux textes.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((tab) => (
          <button
            key={tab.status}
            onClick={() => handleTabChange(tab.status)}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
              activeTab === tab.status
                ? `${TAB_STATUS_STYLES[tab.status]} border-current font-medium`
                : "border-border hover:bg-muted text-muted-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : posts.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-sm text-muted-foreground">Aucun post</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {posts.map((post) => {
            const edited = isEdited(post);
            const isLoading = actionLoading === post.id;

            return (
              <Card key={post.id}>
                <CardContent className="p-4 space-y-3">
                  {/* Top row: category badge + date */}
                  <div className="flex items-center justify-between">
                    <Badge
                      variant="outline"
                      className={
                        CATEGORY_COLORS[post.category] ||
                        "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300"
                      }
                    >
                      {post.category}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(post.createdAt)}
                    </span>
                  </div>

                  {/* One block per network: an approval covers exactly the texts shown here. */}
                  {TEXT_FIELDS.map(({ field, label, max }) => {
                    const text = currentText(post, field);
                    if (activeTab !== "PENDING_REVIEW" && text.length === 0) return null;
                    const inputId = `social-${post.id}-${field}`;
                    return (
                      <div key={field} className="space-y-1">
                        <label
                          htmlFor={inputId}
                          className="text-xs font-medium text-muted-foreground"
                        >
                          {label}
                          {activeTab === "PENDING_REVIEW" && text.length === 0
                            ? " (pas publié sur ce réseau)"
                            : ""}
                        </label>
                        {activeTab === "PENDING_REVIEW" ? (
                          <>
                            <textarea
                              id={inputId}
                              value={text}
                              onChange={(e) => handleContentChange(post.id, field, e.target.value)}
                              className="w-full min-h-[100px] px-3 py-2 text-sm border border-border rounded-lg bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring/50"
                              disabled={isLoading}
                            />
                            <div className="flex items-center justify-end">
                              <span
                                className={`text-xs font-medium tabular-nums ${charCountColor(text.length, max)}`}
                              >
                                {text.length}/{max}
                              </span>
                            </div>
                          </>
                        ) : (
                          <p
                            id={inputId}
                            className={`text-sm whitespace-pre-wrap ${
                              activeTab === "REJECTED" ? "line-through text-muted-foreground" : ""
                            }`}
                          >
                            {text}
                          </p>
                        )}
                      </div>
                    );
                  })}

                  {/* Link */}
                  {post.link && (
                    <div className="text-xs text-muted-foreground truncate">
                      <span className="font-medium">Lien : </span>
                      <a
                        href={post.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {post.link}
                      </a>
                    </div>
                  )}

                  {/* Error messages: legacy pipeline, then the last diagnostic of each network */}
                  {[
                    { label: "Erreur", raw: post.error },
                    { label: "Bluesky", raw: post.blueskyError },
                    { label: "X", raw: post.twitterError },
                  ].map(({ label, raw }) =>
                    raw ? (
                      <div
                        key={label}
                        className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-md px-3 py-2"
                      >
                        <span className="font-medium">{label} : </span>
                        {describeNetworkError(raw)}
                      </div>
                    ) : null
                  )}

                  {/* Platform URLs for posted */}
                  {activeTab === "POSTED" && (post.blueskyUrl || post.twitterUrl) && (
                    <div className="flex flex-wrap gap-3 text-xs">
                      {post.blueskyUrl && (
                        <a
                          href={post.blueskyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Voir sur Bluesky
                        </a>
                      )}
                      {post.twitterUrl && (
                        <a
                          href={post.twitterUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Voir sur X/Twitter
                        </a>
                      )}
                    </div>
                  )}

                  {/* Actions (PENDING_REVIEW only) */}
                  {activeTab === "PENDING_REVIEW" && (
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => handleApprove(post.id)}
                        disabled={isLoading}
                      >
                        {isLoading && actionLoading === post.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                        ) : null}
                        Approuver
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleReject(post.id)}
                        disabled={isLoading}
                      >
                        Rejeter
                      </Button>
                      {edited && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSave(post)}
                          disabled={isLoading}
                        >
                          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                          Sauvegarder
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
