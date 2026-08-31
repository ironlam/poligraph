"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { MeasureReaderGuideMentionStatus, PublicationStatus } from "@/generated/prisma";
import {
  proposeReaderGuidesAction,
  reviewReaderGuideMentionAction,
  type ActionResult,
} from "../actions";

type Mention = {
  id: string;
  term: string;
  evidenceSpan: string;
  reason: string;
  confidence: number;
  status: MeasureReaderGuideMentionStatus;
  guideId: string | null;
  guideLabel: string | null;
  guidePublicationStatus: PublicationStatus | null;
  guideActive: boolean | null;
};

type GuideOption = { id: string; label: string; publicationStatus: PublicationStatus };

export function MeasureReaderGuidesPanel({
  measureId,
  revisionId,
  mentions,
  guides,
}: {
  measureId: string;
  revisionId: string | null;
  mentions: Mention[];
  guides: GuideOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});

  function run(action: () => Promise<ActionResult>): void {
    setFailure(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return setFailure(result.message);
      router.refresh();
    });
  }

  if (!revisionId)
    return <p className="text-sm text-muted-foreground">Aucune révision à analyser.</p>;
  const suggested = mentions.filter((mention) => mention.status === "SUGGESTED");
  const approved = mentions.filter((mention) => mention.status === "APPROVED");
  const publishedGuides = guides.filter((guide) => guide.publicationStatus === "PUBLISHED");

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
        L’IA repère les termes potentiellement techniques. Elle ne rédige aucune définition et ne
        publie aucun rattachement.
      </p>
      <Link
        href="/admin/mesures/reperes"
        className="inline-flex min-h-11 items-center text-sm font-bold text-primary underline"
      >
        Gérer le référentiel des repères
      </Link>
      {failure && (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800"
        >
          {failure}
        </p>
      )}
      {approved.length > 0 && (
        <div>
          <h3 className="text-sm font-bold">Repères validés</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {approved.map((mention) => (
              <li key={mention.id} className="rounded-full bg-primary/10 px-3 py-1 text-sm">
                {mention.guideLabel ?? mention.term}
              </li>
            ))}
          </ul>
        </div>
      )}
      {suggested.length > 0 ? (
        <div>
          <h3 className="text-sm font-bold">Propositions à examiner</h3>
          <ul className="mt-2 space-y-3">
            {suggested.map((mention) => {
              const matchedPublished =
                mention.guidePublicationStatus === "PUBLISHED" && mention.guideActive === true;
              const guideId =
                selected[mention.id] ?? (matchedPublished ? (mention.guideId ?? "") : "");
              return (
                <li key={mention.id} className="rounded border border-border p-3">
                  <p className="font-bold">{mention.term}</p>
                  <p className="mt-1 text-sm">Extrait : « {mention.evidenceSpan} »</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {mention.reason} · confiance {Math.round(mention.confidence * 100)} %
                  </p>
                  {!matchedPublished && (
                    <label className="mt-3 block text-sm font-medium">
                      Repère publié
                      <select
                        value={guideId}
                        onChange={(event) =>
                          setSelected((current) => ({
                            ...current,
                            [mention.id]: event.target.value,
                          }))
                        }
                        className="mt-1 min-h-11 w-full rounded border border-border bg-background px-3 sm:max-w-md"
                      >
                        <option value="">Choisir un repère</option>
                        {publishedGuides.map((guide) => (
                          <option key={guide.id} value={guide.id}>
                            {guide.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {mention.guidePublicationStatus === "DRAFT" && (
                    <p className="mt-2 text-sm text-amber-700">
                      Le repère correspondant doit d’abord être publié.
                    </p>
                  )}
                  {mention.guidePublicationStatus === "PUBLISHED" &&
                    mention.guideActive === false && (
                      <p className="mt-2 text-sm text-amber-700">
                        Le repère correspondant a été désactivé. Choisissez un repère actif.
                      </p>
                    )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      disabled={pending || !guideId || (!matchedPublished && !selected[mention.id])}
                      className="min-h-11"
                      onClick={() =>
                        run(() =>
                          reviewReaderGuideMentionAction({
                            measureId,
                            mentionId: mention.id,
                            guideId,
                            status: "APPROVED",
                          })
                        )
                      }
                    >
                      Valider
                    </Button>
                    <Button
                      variant="outline"
                      disabled={pending}
                      className="min-h-11"
                      onClick={() =>
                        run(() =>
                          reviewReaderGuideMentionAction({
                            measureId,
                            mentionId: mention.id,
                            status: "REJECTED",
                          })
                        )
                      }
                    >
                      Refuser
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Aucune proposition en attente.</p>
      )}
      <Button
        variant="outline"
        disabled={pending}
        className="min-h-11"
        onClick={() => run(() => proposeReaderGuidesAction({ measureId, revisionId }))}
      >
        {pending ? "Analyse en cours…" : "Repérer les termes à expliquer"}
      </Button>
    </div>
  );
}
