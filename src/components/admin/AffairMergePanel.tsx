"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AFFAIR_STATUS_LABELS, AFFAIR_CATEGORY_LABELS } from "@/config/labels";
import type { AffairStatus, AffairCategory } from "@/types";
import type { PublicationStatus } from "@/generated/prisma";

/**
 * Merging a duplicate from the affair itself.
 *
 * The machinery already existed and was correct: `/doublons/fusionner` writes a
 * DUPLICATE ruling in the same transaction, refuses to delete a published fiche,
 * and turns everything a draft says about a published record into proposals
 * instead of overwriting it. What was missing is the way in. The duplicates page
 * only lists pairs the detector scored above 40, and detection is the part that
 * fails: the two Alloncle fiches on the same complaint scored 33, because they
 * name different offences and the « same category » signal therefore counts
 * against exactly the case where one complaint spans several charges.
 *
 * So the panel does not detect anything. It lists the person's other affairs and
 * lets a human say « that one ». A moderator who has read both fiches is a better
 * judge than a threshold, and until now had no way to act on it.
 */

export interface SiblingAffair {
  id: string;
  title: string;
  status: AffairStatus;
  category: AffairCategory;
  publicationStatus: PublicationStatus;
  sourceCount: number;
}

interface Props {
  affairId: string;
  affairTitle: string;
  affairIsPublished: boolean;
  siblings: SiblingAffair[];
}

/**
 * Exhaustive on purpose: a value added to the enum tomorrow breaks the build here
 * instead of rendering an unstyled pill nobody notices.
 */
const STATUS_TONE: Record<PublicationStatus, string> = {
  PUBLISHED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  DRAFT: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  REJECTED: "bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-300",
  ARCHIVED: "bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-300",
  EXCLUDED: "bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-300",
};

export function AffairMergePanel({ affairId, affairTitle, affairIsPublished, siblings }: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  if (siblings.length === 0) return null;

  const absorb = async (other: SiblingAffair) => {
    // Direction is fixed and stated: the fiche you are on survives. Offering a
    // choice here would invite absorbing the page you came from, which is the one
    // case the endpoint refuses anyway.
    const confirmed = window.confirm(
      `Fusionner « ${other.title} » dans « ${affairTitle} » ?\n\n` +
        `L'affaire absorbée sera supprimée et ses anciennes URL redirigeront ici.` +
        (affairIsPublished
          ? `\n\nCette fiche étant publiée, ce que l'absorbée dit du volet judiciaire ` +
            `arrivera en propositions à valider, pas en écriture directe.`
          : "")
    );
    if (!confirmed) return;

    setBusyId(other.id);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/affaires/doublons/fusionner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keepId: affairId,
          removeId: other.id,
          notes: "Doublon confirmé depuis la fiche de l'affaire",
          // A human who read both fiches, not a score: CERTAIN and 1 say exactly that.
          signal: { confidence: "CERTAIN", matchedBy: "fiche-affaire", score: 1 },
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        proposalsCreated?: number;
      };
      if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);

      setResult(
        json.proposalsCreated
          ? `Fusion effectuée. ${json.proposalsCreated} proposition(s) à valider.`
          : "Fusion effectuée."
      );
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Autres affaires de cette personne ({siblings.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Si l{"'"}une décrit les mêmes faits, absorbez-la ici : cette fiche est conservée, l{"'"}
          autre disparaît et ses URL redirigent vers celle-ci.
        </p>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {result && (
          <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">
            {result}
          </p>
        )}

        <ul className="divide-y border rounded-md">
          {siblings.map((s) => {
            // The endpoint refuses to delete a published fiche, whoever asks. Saying
            // so before the click beats a 409 after it.
            const blocked = s.publicationStatus === "PUBLISHED";
            return (
              <li key={s.id} className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/affaires/${s.id}`}
                    className="font-medium hover:underline break-words"
                  >
                    {s.title}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className={STATUS_TONE[s.publicationStatus]}>
                      {s.publicationStatus}
                    </Badge>
                    <span>{AFFAIR_STATUS_LABELS[s.status]}</span>
                    <span aria-hidden>&bull;</span>
                    <span>{AFFAIR_CATEGORY_LABELS[s.category]}</span>
                    <span aria-hidden>&bull;</span>
                    <span>
                      {s.sourceCount} source{s.sourceCount > 1 ? "s" : ""}
                    </span>
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={blocked || busyId !== null}
                  onClick={() => void absorb(s)}
                  title={
                    blocked
                      ? "Une fiche publiée ne peut pas être absorbée : dépubliez-la, ou fusionnez depuis elle."
                      : undefined
                  }
                >
                  {busyId === s.id ? "Fusion…" : "Absorber"}
                </Button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
