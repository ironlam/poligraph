"use client";

import { useState } from "react";
import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AffairPicker } from "@/components/admin/AffairPicker";
import {
  PressArticlePicker,
  type PressArticlePickerResult,
} from "@/components/admin/PressArticlePicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Role = "REVELATION" | "UPDATE" | "MENTION";
type Relation = {
  id: string;
  affairId: string;
  role: Role;
  createdAt: string;
  affair: {
    id: string;
    title: string;
    slug: string;
    publicationStatus: string;
    status: string;
    politician: { id: string; fullName: string; slug: string };
    sources: Array<{ id: string; url: string; title: string; publisher: string }>;
  };
};
type Workbench = PressArticlePickerResult & {
  description: string | null;
  aiSummary: string | null;
  mentions: Array<{
    politician: { id: string; fullName: string; slug: string };
    matchedName: string | null;
  }>;
  affairLinks: Relation[];
  snapshot: { articleVersion: string; relationsHash: string };
  suggestions: Array<{ affair: Relation["affair"]; reasons: string[] }>;
};

const roleLabels: Record<Role, string> = {
  REVELATION: "Révélation",
  UPDATE: "Mise à jour",
  MENTION: "Mention",
};

export function ArticleAffairWorkbench() {
  const [articleId, setArticleId] = useState<string | null>(null);
  const [article, setArticle] = useState<Workbench | null>(null);
  const [selectedAffairId, setSelectedAffairId] = useState<string | null>(null);
  const [oldAffairId, setOldAffairId] = useState<string | undefined>();
  const [operation, setOperation] = useState<"LINK" | "CHANGE" | "REMOVE">("LINK");
  const [role, setRole] = useState<Role>("MENTION");
  const [addSource, setAddSource] = useState(true);
  const [justification, setJustification] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadArticle(id: string | null) {
    setArticleId(id);
    setArticle(null);
    setError(null);
    setSuccess(null);
    if (!id) return;
    const response = await fetch(
      `/api/admin/relationships/articles-affairs?articleId=${encodeURIComponent(id)}`
    );
    if (!response.ok) {
      setError("Impossible de charger le contexte de l’article.");
      return;
    }
    setArticle((await response.json()) as Workbench);
  }

  async function mutate() {
    if (!article || !articleId || justification.trim().length < 20) return;
    if (operation !== "REMOVE" && !selectedAffairId) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    const response = await fetch("/api/admin/relationships/articles-affairs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation,
        articleId,
        affairId: operation === "REMOVE" ? undefined : selectedAffairId,
        oldAffairId: operation === "REMOVE" ? (oldAffairId ?? selectedAffairId) : oldAffairId,
        role,
        addSource: operation === "LINK" && addSource,
        justification,
        expected: article.snapshot,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) setError(payload.error ?? "La relation n’a pas été modifiée.");
    else {
      setSuccess(
        operation === "REMOVE" ? "La liaison a été retirée." : "La liaison a été enregistrée."
      );
      setJustification("");
      await loadArticle(articleId);
    }
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Articles ↔ affaires"
        description="Relier explicitement un article à une ou plusieurs affaires, avec contexte et justification."
        help="Le contenu intégral de l’article n’est jamais chargé dans cet atelier."
      />
      <PressArticlePicker
        value={articleId}
        onChange={(id) => void loadArticle(id)}
        description="Recherchez par titre, URL ou éditeur. Les résultats sont limités à 20."
      />
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {success && (
        <p
          role="status"
          className="rounded-md border border-emerald-500/40 p-3 text-sm text-emerald-700"
        >
          {success}
        </p>
      )}
      {article && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Article sélectionné</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <h2 className="font-semibold">{article.title}</h2>
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-primary underline"
                aria-label="Ouvrir l’article externe dans un nouvel onglet"
              >
                {article.feedSource} <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
              <p>
                {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(
                  new Date(article.publishedAt)
                )}
              </p>
              <p>{article.aiSummary || article.description || "Aucun résumé disponible."}</p>
              <p>
                Analyse : {article.aiAnalyzedAt ? "terminée" : "non réalisée"} · Article lié à une
                affaire : {article.isAffairRelated ? "oui" : "non"}
              </p>
              <p>
                Personnalités mentionnées :{" "}
                {article.mentions.map((mention) => mention.politician.fullName).join(", ") ||
                  "aucune"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Relations actuelles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {article.affairLinks.length === 0 && (
                <p className="text-sm text-muted-foreground">Aucune relation actuellement.</p>
              )}
              {article.affairLinks.map((relation) => (
                <div key={relation.id} className="rounded-md border p-3 text-sm">
                  <p className="font-medium">{relation.affair.title}</p>
                  <p className="text-muted-foreground">
                    {relation.affair.politician.fullName} · {relation.affair.publicationStatus} ·{" "}
                    {roleLabels[relation.role]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Source de même URL :{" "}
                    {relation.affair.sources.some((source) => source.url === article.url)
                      ? "oui"
                      : "non"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setOperation("CHANGE");
                        setOldAffairId(relation.affairId);
                        setSelectedAffairId(null);
                      }}
                    >
                      Changer cette liaison
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => {
                        setOperation("REMOVE");
                        setOldAffairId(relation.affairId);
                        setSelectedAffairId(relation.affairId);
                      }}
                    >
                      Retirer cette liaison
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Suggestions déterministes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {article.suggestions.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Aucune suggestion déterministe. Utilisez la recherche manuelle.
                </p>
              )}
              {article.suggestions.map((suggestion) => (
                <div
                  key={suggestion.affair.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{suggestion.affair.title}</p>
                    <p className="text-muted-foreground">{suggestion.reasons.join(" · ")}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setOperation("LINK");
                      setOldAffairId(undefined);
                      setSelectedAffairId(suggestion.affair.id);
                    }}
                  >
                    Préparer la liaison
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>
                {operation === "REMOVE"
                  ? "Retirer une relation"
                  : operation === "CHANGE"
                    ? "Changer une relation"
                    : "Ajouter une relation"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {operation !== "REMOVE" && (
                <AffairPicker
                  value={selectedAffairId}
                  onChange={(id) => setSelectedAffairId(id)}
                  label="Nouvelle affaire"
                  description="Aucune suggestion n’est appliquée automatiquement."
                />
              )}
              {operation !== "REMOVE" && (
                <label className="block text-sm font-medium" htmlFor="article-affair-role">
                  Rôle de la relation
                  <select
                    id="article-affair-role"
                    value={role}
                    onChange={(event) => setRole(event.target.value as Role)}
                    className="mt-1 min-h-11 w-full rounded-md border bg-background px-3"
                  >
                    <option value="REVELATION">Révélation</option>
                    <option value="UPDATE">Mise à jour</option>
                    <option value="MENTION">Mention</option>
                  </select>
                </label>
              )}
              {operation === "LINK" && (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={addSource}
                    onChange={(event) => setAddSource(event.target.checked)}
                    className="mt-1"
                  />
                  Ajouter également cet article comme source de l’affaire
                </label>
              )}
              {operation === "CHANGE" && (
                <p className="text-sm text-muted-foreground">
                  La liaison interne sera déplacée. Une éventuelle source déjà publiée sur
                  l’ancienne affaire sera conservée.
                </p>
              )}
              {operation === "REMOVE" && (
                <p className="text-sm text-muted-foreground">
                  Seule la liaison PressArticleAffair sera supprimée. L’article, l’affaire et les
                  sources seront conservés.
                </p>
              )}
              <label className="block text-sm font-medium" htmlFor="article-affair-justification">
                Justification, 20 caractères minimum
              </label>
              <textarea
                id="article-affair-justification"
                value={justification}
                onChange={(event) => setJustification(event.target.value)}
                className="min-h-24 w-full rounded-md border bg-background p-3 text-sm"
              />
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  disabled={
                    busy ||
                    justification.trim().length < 20 ||
                    (operation !== "REMOVE" && !selectedAffairId)
                  }
                  onClick={() => void mutate()}
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}Confirmer
                  l’action
                </Button>
                <Badge variant="outline">État contrôlé par le serveur</Badge>
              </div>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                Une modification concurrente renvoie une erreur 409 et n’applique aucune mutation
                partielle.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
