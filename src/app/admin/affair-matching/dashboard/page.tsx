"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

// ─── Types ───────────────────────────────────────────────────────

type StatsRow = { source: string; judgment: string; count: number };

interface StatsResponse {
  pendingUndecided: number;
  pendingNoMatch: number;
  last7Days: StatsRow[];
}

interface BlockedAffair {
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

// ─── Constants ───────────────────────────────────────────────────

const SOURCES = ["JUDILIBRE", "PRESS", "FACTCHECK", "MANUAL"];
const JUDGMENTS = ["SAME", "UNDECIDED", "NO_MATCH", "NOT_SAME", "MANUAL_OVERRIDE"];

const SOURCE_LABELS: Record<string, string> = {
  JUDILIBRE: "Judilibre",
  PRESS: "Presse",
  FACTCHECK: "Fact-check",
  MANUAL: "Manuel",
};

// ─── Page ────────────────────────────────────────────────────────

export default function AffairMatchingDashboardPage() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Loaded separately: the blocking list calls the publish guard per affair, so
  // it takes about a second and a half. The counters must not wait for it.
  const [blocked, setBlocked] = useState<BlockedResponse | null>(null);
  const [blockedError, setBlockedError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/affair-matching/stats");
        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        setData(await res.json());
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();

    (async () => {
      try {
        const res = await fetch("/api/admin/affair-matching/blocked");
        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        setBlocked(await res.json());
      } catch (err) {
        setBlockedError((err as Error).message);
      }
    })();
  }, []);

  const countFor = (source: string, judgment: string) => {
    if (!data) return 0;
    return data.last7Days.find((r) => r.source === source && r.judgment === judgment)?.count ?? 0;
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-1">Tableau de bord - Liaison affaires</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Vue d{"'"}ensemble des décisions de liaison affaire vers politicien.
      </p>

      <BlockedSection data={blocked} error={blockedError} />

      {loading && <p className="text-muted-foreground">Chargement...</p>}
      {error && (
        <p className="text-destructive" role="alert">
          Erreur : {error}
        </p>
      )}

      {data && (
        <>
          {/* Registry size. Context, not workload: kept small and labelled as such,
              because two big counters here used to read as a backlog to clear. */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-1">Taille du registre</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Ces décisions attendent une relecture, mais seules celles listées plus haut retiennent
              une publication.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Link href="/admin/affair-matching/review?tab=UNDECIDED">
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Hésitations du résolveur</p>
                    <p className="text-3xl font-bold mt-2 tabular-nums">{data.pendingUndecided}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      décisions UNDECIDED jamais relues
                    </p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/admin/affair-matching/review?tab=NO_MATCH">
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Aucun candidat retenu</p>
                    <p className="text-3xl font-bold mt-2 tabular-nums">{data.pendingNoMatch}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      décisions NO_MATCH, qui ne bloquent jamais une publication
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </section>

          {/* Activity table */}
          <section>
            <h2 className="text-lg font-semibold mb-3">Activité des 7 derniers jours</h2>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="px-4 py-3 text-left font-medium">Source</th>
                        {JUDGMENTS.map((j) => (
                          <th key={j} className="px-4 py-3 text-right font-medium">
                            {j}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {SOURCES.map((source, i) => (
                        <tr
                          key={source}
                          className={i < SOURCES.length - 1 ? "border-b" : undefined}
                        >
                          <td className="px-4 py-3 font-medium">
                            {SOURCE_LABELS[source] ?? source}
                          </td>
                          {JUDGMENTS.map((judgment) => {
                            const n = countFor(source, judgment);
                            return (
                              <td
                                key={judgment}
                                className={`px-4 py-3 text-right tabular-nums ${n === 0 ? "text-muted-foreground" : ""}`}
                              >
                                {n}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Link to review */}
          <div className="mt-6">
            <Link
              href="/admin/affair-matching/review"
              className="text-sm text-primary hover:underline"
            >
              Aller à la revue des décisions
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Blocked affairs ─────────────────────────────────────────────

/**
 * The only part of this page that is a to-do list.
 *
 * Drafts and published fiches are separated because the two say different
 * things: a draft cannot go out until its attribution is settled, while a
 * published one is already out on an attribution nobody confirmed. Merging them
 * under one count would hide the second, which is the more serious of the two.
 */
function BlockedSection({ data, error }: { data: BlockedResponse | null; error: string | null }) {
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
