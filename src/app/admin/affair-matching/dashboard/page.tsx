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

      {loading && <p className="text-muted-foreground">Chargement...</p>}
      {error && (
        <p className="text-destructive" role="alert">
          Erreur : {error}
        </p>
      )}

      {data && (
        <>
          {/* Pending counters */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <Link href="/admin/affair-matching/review?tab=UNDECIDED">
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">En attente de revue</p>
                  <p className="text-4xl font-bold mt-2">{data.pendingUndecided}</p>
                  <p className="text-xs text-muted-foreground mt-1">décisions UNDECIDED</p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/admin/affair-matching/review?tab=NO_MATCH">
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Sans candidat</p>
                  <p className="text-4xl font-bold mt-2">{data.pendingNoMatch}</p>
                  <p className="text-xs text-muted-foreground mt-1">décisions NO_MATCH</p>
                </CardContent>
              </Card>
            </Link>
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
