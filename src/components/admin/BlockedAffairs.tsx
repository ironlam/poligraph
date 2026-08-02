"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

export interface BlockedAffair {
  id: string;
  slug: string;
  title: string;
  publicationStatus: "DRAFT" | "PUBLISHED";
  politicianName: string;
  decisionIds: string[];
  messages: string[];
  otherBlockers: string[];
}

interface BlockedResponse {
  affairs: BlockedAffair[];
  decisionCount: number;
}

/**
 * Fetches on mount rather than taking props: it lives at the top of the review
 * page, which is where a moderator actually lands, and that page must not wait
 * on a guard call that takes about a second and a half.
 */
export function BlockedAffairs() {
  const [data, setData] = useState<BlockedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/affair-matching/blocked");
        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        setData(await res.json());
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, []);

  return <BlockedAffairsPanel data={data} error={error} />;
}

/**
 * The only part of this page that is a to-do list.
 *
 * Drafts and published fiches are separated because the two say different
 * things: a draft cannot go out until its attribution is settled, while a
 * published one is already out on an attribution nobody confirmed. Merging them
 * under one count would hide the second, which is the more serious of the two.
 */
export function BlockedAffairsPanel({
  data,
  error,
}: {
  data: BlockedResponse | null;
  error: string | null;
}) {
  if (error) {
    return (
      <p className="text-destructive mb-8" role="alert">
        Liste des affaires bloquées indisponible : {error}
      </p>
    );
  }

  if (!data) {
    return <p className="text-muted-foreground mb-8">Recherche des affaires bloquées...</p>;
  }

  if (data.affairs.length === 0) {
    return (
      <Card className="mb-8">
        <CardContent className="pt-6">
          <p className="font-medium">Aucune publication retenue.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Toutes les attributions qui gouvernent une fiche vivante sont tranchées.
          </p>
        </CardContent>
      </Card>
    );
  }

  const drafts = data.affairs.filter((a) => a.publicationStatus === "DRAFT");
  const published = data.affairs.filter((a) => a.publicationStatus === "PUBLISHED");

  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-1">
        À trancher : {data.decisionCount} rattachement
        {data.decisionCount > 1 ? "s" : ""} sur {data.affairs.length} affaire
        {data.affairs.length > 1 ? "s" : ""}
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        Chaque fiche s{"'"}ouvre sur un panneau qui montre l{"'"}extrait de presse et les candidats.
        Deux boutons par décision.
      </p>

      <BlockedGroup
        title="Brouillons qui ne peuvent pas être publiés"
        affairs={drafts}
        emptyHint={null}
      />
      <BlockedGroup
        title="Fiches en ligne dont l'attribution n'a jamais été validée"
        affairs={published}
        emptyHint={null}
      />
    </section>
  );
}

function BlockedGroup({
  title,
  affairs,
  emptyHint,
}: {
  title: string;
  affairs: BlockedAffair[];
  emptyHint: string | null;
}) {
  if (affairs.length === 0) return emptyHint ? <p className="text-sm">{emptyHint}</p> : null;

  return (
    <div className="mb-5">
      <h3 className="text-sm font-medium text-muted-foreground mb-2">
        {title} ({affairs.length})
      </h3>
      <Card>
        <CardContent className="p-0">
          <ul>
            {affairs.map((a, i) => (
              <li key={a.id} className={i < affairs.length - 1 ? "border-b" : undefined}>
                <Link
                  href={`/admin/affaires/${a.id}`}
                  className="block px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <p className="font-medium">{a.title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {a.politicianName} &bull; {a.messages.join(" ; ")}
                  </p>
                  {a.otherBlockers.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Bloquée aussi par : {a.otherBlockers.join(" ; ")}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
