"use client";

import { useCallback } from "react";
import {
  AdminEntityPicker,
  type AdminEntityPickerResult,
} from "@/components/admin/AdminEntityPicker";

export interface PressArticlePickerResult extends AdminEntityPickerResult {
  title: string;
  url: string;
  feedSource: string;
  publishedAt: string;
  aiAnalyzedAt: string | null;
  isAffairRelated: boolean | null;
  _count: { mentions: number; affairLinks: number };
}

async function requestArticles(
  url: string,
  signal: AbortSignal
): Promise<PressArticlePickerResult[]> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Recherche d’article indisponible");
  const data = (await response.json()) as {
    results?: PressArticlePickerResult[];
    result?: PressArticlePickerResult | null;
  };
  return data.results ?? (data.result ? [data.result] : []);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value));
}

export function PressArticlePicker({
  value,
  onChange,
  label = "Article de presse",
  description,
}: {
  value: string | null;
  onChange: (value: string | null, result: PressArticlePickerResult | null) => void;
  label?: string;
  description?: string;
}) {
  const search = useCallback(
    (query: string, signal: AbortSignal) =>
      requestArticles(
        `/api/admin/entities/press-articles?q=${encodeURIComponent(query)}&page=1&limit=20`,
        signal
      ),
    []
  );
  const resolve = useCallback(
    (id: string, signal: AbortSignal) =>
      requestArticles(
        `/api/admin/entities/press-articles?id=${encodeURIComponent(id)}`,
        signal
      ).then((items) => items[0] ?? null),
    []
  );

  return (
    <AdminEntityPicker<PressArticlePickerResult>
      value={value}
      onChange={onChange}
      search={search}
      resolve={resolve}
      renderResult={(article) => (
        <div className="pr-5">
          <p className="font-medium">{article.title}</p>
          <p className="text-xs text-muted-foreground">
            {article.feedSource} · {formatDate(article.publishedAt)} · {article._count.affairLinks}{" "}
            affaire(s)
          </p>
          <p className="text-xs text-muted-foreground">
            {article._count.mentions} personnalité(s) mentionnée(s) ·{" "}
            {article.aiAnalyzedAt ? "Analysé" : "Non analysé"}
          </p>
        </div>
      )}
      label={label}
      placeholder="Rechercher par titre, URL ou éditeur..."
      description={description}
    />
  );
}
