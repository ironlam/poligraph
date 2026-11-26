"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PUBLICATION_STATUS_LABELS, PUBLICATION_STATUS_STYLES } from "@/config/labels";
import type { PublicationStatus } from "@/types";

type Action = "publish" | "draft" | "archive" | "exclude";

const GESTURES: Array<{ action: Action; target: PublicationStatus; label: string }> = [
  { action: "publish", target: "PUBLISHED", label: "Publier la fiche" },
  { action: "draft", target: "DRAFT", label: "Remettre en brouillon" },
  { action: "archive", target: "ARCHIVED", label: "Archiver" },
  { action: "exclude", target: "EXCLUDED", label: "Exclure" },
];

interface ProfilePublicationCardProps {
  politicianId: string;
  publicationStatus: PublicationStatus;
  mandateCount: number;
  sourcedMandateCount: number;
  externalIdCount: number;
}

/**
 * The publication status of a profile and the gestures that change it. The server decides: this
 * card only says beforehand what it will refuse, so the refusal is not a surprise.
 */
export function ProfilePublicationCard({
  politicianId,
  publicationStatus,
  mandateCount,
  sourcedMandateCount,
  externalIdCount,
}: ProfilePublicationCardProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasSource = sourcedMandateCount + externalIdCount > 0;

  async function run(action: Action) {
    // Taking a public profile off the site is the one gesture a slip must not make.
    if (
      publicationStatus === "PUBLISHED" &&
      !window.confirm("Cette fiche est publique. La retirer du site ?")
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/politiques/${politicianId}/publication`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Erreur ${res.status}`);
        return;
      }
      router.refresh();
    } catch {
      setError("Le changement n'a pas abouti. Vérifiez la connexion et réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3">
          Publication
          <Badge variant="outline" className={PUBLICATION_STATUS_STYLES[publicationStatus] || ""}>
            {PUBLICATION_STATUS_LABELS[publicationStatus] || publicationStatus}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div role="alert" aria-live="assertive" className="rounded-md bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}
        <p className="text-sm">
          {mandateCount} mandat{mandateCount > 1 ? "s" : ""}, dont {sourcedMandateCount} avec une
          source. {externalIdCount} identifiant{externalIdCount > 1 ? "s" : ""} externe
          {externalIdCount > 1 ? "s" : ""}.
        </p>
        {publicationStatus !== "PUBLISHED" && (
          <p className="text-sm text-muted-foreground">
            {hasSource
              ? "Relisez l'état civil, les mandats et leurs sources ci-dessous avant de publier."
              : "Une fiche se publie avec au moins un mandat sourcé ou un identifiant externe."}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {GESTURES.filter((g) => g.target !== publicationStatus).map((g) => (
            <Button
              key={g.action}
              type="button"
              variant={g.action === "publish" ? "default" : "outline"}
              disabled={busy || (g.action === "publish" && !hasSource)}
              onClick={() => run(g.action)}
            >
              {g.label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Un statut choisi ici n&apos;est plus modifié par les règles automatiques. Une fiche qui a
          une affaire publiée ne peut pas être retirée du site : dépubliez l&apos;affaire
          d&apos;abord.
        </p>
      </CardContent>
    </Card>
  );
}
