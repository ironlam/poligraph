import type { Metadata } from "next";
import { db } from "@/lib/db";
import { isMissingTableError } from "@/lib/data/commune-population";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_STATUS_LABELS,
  type FeedbackCategoryKey,
} from "@/config/feedback";
import { CloseFeedbackButtons } from "./CloseFeedbackButtons";

export const metadata: Metadata = { title: "Retours visiteurs - Admin" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

export default async function AdminRetoursPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
}) {
  const { statut } = await searchParams;
  const showAll = statut === "tous";

  let feedbacks;
  try {
    feedbacks = await db.visitorFeedback.findMany({
      where: showAll ? undefined : { status: "NEW" },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
    });
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
    return (
      <div className="space-y-4">
        <h1 className="title-section">Retours visiteurs</h1>
        <p className="text-muted-foreground">
          La table des retours n&apos;existe pas encore : appliquer{" "}
          <code>prisma/migrations/manual/2026-10-21-visitor-feedback.sql</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="title-section">Retours visiteurs</h1>
        <p className="text-sm text-muted-foreground">
          {showAll ? "Tous les retours" : "Retours à traiter"} ({feedbacks.length}).{" "}
          <a className="underline" href={showAll ? "/admin/retours" : "/admin/retours?statut=tous"}>
            {showAll ? "Voir seulement les retours à traiter" : "Voir tous les retours"}
          </a>
        </p>
      </div>

      {feedbacks.length === 0 && (
        <p className="text-muted-foreground">Aucun retour pour le moment.</p>
      )}

      {feedbacks.map((f) => (
        <Card key={f.id} id={f.id}>
          <CardHeader>
            <h2 className="title-card">
              {FEEDBACK_CATEGORY_LABELS[f.category as FeedbackCategoryKey]}
            </h2>
            <p className="text-sm text-muted-foreground">
              {f.createdAt.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })} ·{" "}
              {FEEDBACK_STATUS_LABELS[f.status]}
              {f.pagePath && (
                <>
                  {" "}
                  · page <code>{f.pagePath}</code>
                </>
              )}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Texte brut, jamais interprété : le message vient d'un visiteur anonyme. */}
            <p className="whitespace-pre-wrap break-words">{f.message}</p>
            {f.contactEmail && (
              <p className="text-sm">
                Répondre à :{" "}
                <a className="underline" href={`mailto:${f.contactEmail}`}>
                  {f.contactEmail}
                </a>
              </p>
            )}
            <div className="flex flex-wrap items-center gap-4">
              {f.status === "NEW" && <CloseFeedbackButtons id={f.id} />}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
