import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getPromiseById } from "@/lib/data/promises";
import {
  PROMISE_EXTRACTION_STATUS_LABELS,
  PROMISE_SOURCE_KIND_LABELS,
  THEME_CATEGORY_LABELS,
} from "@/config/labels";
import { PromiseModerationActions } from "./PromiseModerationActions";

export const metadata = { title: "Réviser promesse", robots: { index: false } };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminPromiseDetailPage({ params }: PageProps) {
  const { id } = await params;
  const promise = await getPromiseById(id);
  if (!promise) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <Link
          href="/admin/promises"
          prefetch={false}
          className="text-sm text-primary hover:underline"
        >
          ← Retour
        </Link>
        <h1 className="text-2xl font-display font-bold tracking-tight mt-2">
          Réviser une promesse
        </h1>
      </header>

      <Card>
        <CardHeader>
          <div className="text-sm text-muted-foreground">
            <Link
              href={`/politiques/${promise.politician.slug}`}
              prefetch={false}
              className="text-primary hover:underline"
            >
              {promise.politician.fullName}
            </Link>
            <span className="mx-2">·</span>
            {PROMISE_SOURCE_KIND_LABELS[promise.sourceKind]}
            <span className="mx-2">·</span>
            {new Date(promise.publishedAt).toLocaleDateString("fr-FR")}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <blockquote className="border-l-4 border-primary pl-4 italic">{promise.text}</blockquote>
          {promise.context && (
            <div>
              <h2 className="text-sm font-semibold mb-1">Contexte</h2>
              <p className="text-sm text-muted-foreground">{promise.context}</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Thème :</span> {THEME_CATEGORY_LABELS[promise.theme]}
              {promise.themeConfidence !== null && promise.themeConfidence !== undefined && (
                <span className="text-muted-foreground">
                  {" "}
                  ({Math.round(promise.themeConfidence * 100)}%)
                </span>
              )}
            </div>
            <div>
              <span className="font-medium">Statut :</span>{" "}
              {PROMISE_EXTRACTION_STATUS_LABELS[promise.extractionStatus]}
            </div>
            {promise.extractionMethod && (
              <div>
                <span className="font-medium">Méthode :</span> {promise.extractionMethod}
                {promise.extractionConfidence !== null &&
                  promise.extractionConfidence !== undefined && (
                    <span className="text-muted-foreground">
                      {" "}
                      ({Math.round(promise.extractionConfidence * 100)}%)
                    </span>
                  )}
              </div>
            )}
            {promise.sourceLabel && (
              <div>
                <span className="font-medium">Source :</span> {promise.sourceLabel}
              </div>
            )}
            {promise.sourceUrl && (
              <div className="md:col-span-2">
                <span className="font-medium">Lien :</span>{" "}
                <a
                  href={promise.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline break-all"
                >
                  {promise.sourceUrl}
                </a>
              </div>
            )}
            {promise.rejectionReason && (
              <div className="md:col-span-2">
                <span className="font-medium">Raison de rejet précédente :</span>{" "}
                <span className="text-muted-foreground">{promise.rejectionReason}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <PromiseModerationActions
        promiseId={promise.id}
        currentTheme={promise.theme}
        currentStatus={promise.extractionStatus}
      />
    </div>
  );
}
