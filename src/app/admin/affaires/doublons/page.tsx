"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, ExternalLink, Link2, Loader2 } from "lucide-react";

// Issue #525: review queue for detected duplicate pairs, grouped by politician.
// Detection now covers published affairs, so most pairs land here rather than in
// the cron. Nothing on this page moves data without an explicit click.

type Classification = "DUPLICATE" | "LINKED" | "DISTINCT" | "UNCERTAIN";
type MergeDecision =
  | "AUTO_MERGE_DRAFTS"
  | "AUTO_ABSORB_DRAFT_INTO_PUBLISHED"
  | "REVIEW_REQUIRED"
  | "NOT_ELIGIBLE";

interface PairSide {
  id: string;
  title: string;
  publicId: string | null;
  slug: string;
  publicationStatus: string;
  verifiedAt: string | null;
  category: string;
  status: string;
  involvement: string;
  verdictDate: string | null;
  factsDate: string | null;
  linkedAffairId: string | null;
  sources: string[];
}

interface PairRow {
  pairKey: string;
  confidence: string;
  matchedBy: string;
  score: number;
  contradictions: string[];
  unpropagatableDifferences: string[];
  sharesOfficialIdentifier: boolean;
  previousClassification: Classification | null;
  rulingStale: boolean;
  plan: { decision: MergeDecision; reason: string; keepId?: string; removeId?: string };
  affairA: PairSide;
  affairB: PairSide;
}

interface Group {
  politician: { id: string; firstName: string; lastName: string; slug: string } | null;
  pairs: PairRow[];
}

interface Metrics {
  candidatePairs: number;
  ruled: number;
  decided: number;
  byClassification: Record<Classification, number>;
  duplicateRate: number | null;
  usefulMatchRate: number | null;
  falsePositiveRate: number | null;
}

const CLASSIFICATION_LABELS: Record<Classification, string> = {
  DUPLICATE: "Doublon à fusionner",
  LINKED: "Affaires liées",
  DISTINCT: "Affaires distinctes",
  UNCERTAIN: "Incertain",
};

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "PUBLISHED") return "default";
  if (status === "DRAFT") return "secondary";
  return "outline";
}

export default function DuplicatesReviewPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyPair, setBusyPair] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/affaires/doublons");
      if (!res.ok) throw new Error(`Chargement impossible (${res.status})`);
      const data = await res.json();
      setGroups(data.groups ?? []);
      setMetrics(data.metrics ?? null);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (pair: PairRow, url: string, body: Record<string, unknown>) => {
      setBusyPair(pair.pairKey);
      setError(null);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error ?? `Échec (${res.status})`);
        }
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur inconnue");
      } finally {
        setBusyPair(null);
      }
    },
    [load]
  );

  const classify = (pair: PairRow, classification: Exclude<Classification, "DUPLICATE">) =>
    act(pair, "/api/admin/affaires/doublons/decision", {
      affairIdA: pair.affairA.id,
      affairIdB: pair.affairB.id,
      classification,
      notes: notes[pair.pairKey] || undefined,
      signal: { confidence: pair.confidence, matchedBy: pair.matchedBy, score: pair.score },
    });

  const merge = (pair: PairRow, keep: PairSide, remove: PairSide) => {
    const message =
      `Fusionner « ${remove.title} » dans « ${keep.title} » ?\n\n` +
      `L'affaire absorbée sera supprimée. Ses anciennes URL continueront de résoudre ` +
      `vers l'affaire conservée.`;
    if (!window.confirm(message)) return;
    return act(pair, "/api/admin/affaires/doublons/fusionner", {
      keepId: keep.id,
      removeId: remove.id,
      notes: notes[pair.pairKey] || undefined,
      signal: { confidence: pair.confidence, matchedBy: pair.matchedBy, score: pair.score },
    });
  };

  const publishLink = (pair: PairRow, from: PairSide, to: PairSide) => {
    const replacing = Boolean(from.linkedAffairId && from.linkedAffairId !== to.id);
    const existing = replacing
      ? `\n\nAttention : « ${from.title} » est déjà liée à une autre affaire. Ce lien sera remplacé.`
      : "";
    const message =
      `Publier le lien de « ${from.title} » vers « ${to.title} » ?\n\n` +
      `Le lien est visible sur les fiches publiées.${existing}`;
    if (!window.confirm(message)) return;
    return act(pair, "/api/admin/affaires/doublons/lier", {
      fromAffairId: from.id,
      toAffairId: to.id,
      confirmed: true,
      // L'API refuse un remplacement implicite, la boîte de dialogue ne suffit pas.
      ...(replacing ? { confirmReplacement: true } : {}),
    });
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span>Chargement de la file…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Doublons d&apos;affaires</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {total} paire{total > 1 ? "s" : ""} détectée{total > 1 ? "s" : ""}, regroupée
          {total > 1 ? "s" : ""} par personnalité. Les affaires d&apos;une même personne se lisent
          ensemble : une paire qui ressemble à un doublon isolément est souvent deux chefs
          d&apos;une même décision.
        </p>
      </header>

      {metrics && (
        <Card>
          <CardContent className="space-y-3 p-4 text-sm">
            <div className="flex flex-wrap gap-x-8 gap-y-1">
              <span>
                Paires tranchées : <strong>{metrics.decided}</strong>
                {metrics.byClassification.UNCERTAIN > 0 && (
                  <span className="text-muted-foreground">
                    {" "}
                    (+ {metrics.byClassification.UNCERTAIN} différée
                    {metrics.byClassification.UNCERTAIN > 1 ? "s" : ""})
                  </span>
                )}
              </span>
              {(
                [
                  ["Vrais doublons", metrics.duplicateRate],
                  ["Rapprochements utiles", metrics.usefulMatchRate],
                  ["Faux positifs francs", metrics.falsePositiveRate],
                ] as const
              ).map(([label, rate]) => (
                <span key={label}>
                  {label} :{" "}
                  <strong>
                    {rate === null ? "pas encore mesurable" : `${Math.round(rate * 100)} %`}
                  </strong>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
              {(Object.keys(CLASSIFICATION_LABELS) as Classification[]).map((key) => (
                <span key={key}>
                  {CLASSIFICATION_LABELS[key]} : {metrics.byClassification[key]}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Une paire différée n&apos;entre dans aucun taux : elle ne tranche rien. Un
              rapprochement utile n&apos;est pas forcément un doublon : deux chefs d&apos;une même
              décision se lient, ils ne se fusionnent pas.
            </p>
          </CardContent>
        </Card>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucune paire en attente de revue.</p>
      )}

      {groups.map((group) => (
        <section key={group.politician?.id ?? "inconnu"} className="space-y-3">
          <h2 className="text-lg font-medium">
            {group.politician ? (
              <Link
                href={`/politiques/${group.politician.slug}`}
                className="underline-offset-4 hover:underline"
              >
                {group.politician.firstName} {group.politician.lastName}
              </Link>
            ) : (
              "Personnalité inconnue"
            )}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({group.pairs.length} paire{group.pairs.length > 1 ? "s" : ""})
            </span>
          </h2>

          {group.pairs.map((pair) => {
            const busy = busyPair === pair.pairKey;
            const sides = [pair.affairA, pair.affairB];
            const draft = sides.find((s) => s.publicationStatus === "DRAFT");
            const published = sides.find((s) => s.publicationStatus === "PUBLISHED");

            return (
              <Card key={pair.pairKey}>
                <CardContent className="space-y-4 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline">{pair.confidence}</Badge>
                    <Badge variant="outline">{pair.matchedBy}</Badge>
                    <span className="text-muted-foreground">score {pair.score}</span>
                    {pair.sharesOfficialIdentifier && (
                      <Badge variant="secondary">identifiant judiciaire commun</Badge>
                    )}
                    {pair.previousClassification && (
                      <Badge variant="secondary">
                        déjà jugé : {CLASSIFICATION_LABELS[pair.previousClassification]}
                      </Badge>
                    )}
                    {pair.rulingStale && (
                      <Badge variant="destructive">à réexaminer, les fiches ont changé</Badge>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[40rem] text-sm">
                      <caption className="sr-only">
                        Comparaison des deux affaires de la paire
                      </caption>
                      <thead>
                        <tr className="text-left text-xs uppercase text-muted-foreground">
                          <th scope="col" className="py-1 pr-3 font-medium">
                            Champ
                          </th>
                          {sides.map((s) => (
                            <th key={s.id} scope="col" className="py-1 pr-3 font-medium">
                              {s.publicId ?? s.id.slice(0, 8)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t">
                          <th scope="row" className="py-1 pr-3 text-left font-normal">
                            Titre
                          </th>
                          {sides.map((s) => (
                            <td key={s.id} className="py-1 pr-3">
                              <Link
                                href={`/affaires/${s.slug}`}
                                className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                              >
                                {s.title}
                                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                              </Link>
                            </td>
                          ))}
                        </tr>
                        <tr className="border-t">
                          <th scope="row" className="py-1 pr-3 text-left font-normal">
                            Publication
                          </th>
                          {sides.map((s) => (
                            <td key={s.id} className="py-1 pr-3">
                              <Badge variant={statusVariant(s.publicationStatus)}>
                                {s.publicationStatus}
                              </Badge>
                              {s.verifiedAt && (
                                <span className="ml-2 text-xs text-muted-foreground">vérifiée</span>
                              )}
                            </td>
                          ))}
                        </tr>
                        {(
                          [
                            ["Catégorie", "category"],
                            ["État", "status"],
                            ["Implication", "involvement"],
                            ["Date de verdict", "verdictDate"],
                            ["Date des faits", "factsDate"],
                          ] as const
                        ).map(([label, field]) => {
                          const differs = sides[0]![field] !== sides[1]![field];
                          return (
                            <tr key={field} className="border-t">
                              <th scope="row" className="py-1 pr-3 text-left font-normal">
                                {label}
                              </th>
                              {sides.map((s) => (
                                <td
                                  key={s.id}
                                  className={`py-1 pr-3 ${differs ? "font-medium" : "text-muted-foreground"}`}
                                >
                                  {String(s[field] ?? "—").slice(0, 30)}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {pair.contradictions.length > 0 && (
                    <p className="text-sm">
                      <strong>Données contradictoires :</strong> {pair.contradictions.join(", ")}.
                      Deux décisions distinctes plutôt qu&apos;un doublon, sauf erreur de saisie.
                    </p>
                  )}
                  {pair.unpropagatableDifferences.length > 0 && (
                    <p className="text-sm">
                      <strong>Non transférable automatiquement :</strong>{" "}
                      {pair.unpropagatableDifferences.join(", ")}.
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">{pair.plan.reason}</p>

                  <Textarea
                    aria-label="Note de revue"
                    placeholder="Note de revue (facultatif)"
                    value={notes[pair.pairKey] ?? ""}
                    onChange={(e) =>
                      setNotes((prev) => ({ ...prev, [pair.pairKey]: e.target.value }))
                    }
                    rows={2}
                  />

                  <div className="flex flex-wrap gap-2">
                    {draft && published && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => merge(pair, published, draft)}
                      >
                        Fusionner le brouillon dans la fiche publiée
                      </Button>
                    )}
                    {!published && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => merge(pair, sides[0]!, sides[1]!)}
                      >
                        Fusionner dans {sides[0]!.publicId ?? "la première"}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => classify(pair, "LINKED")}
                    >
                      Affaires liées
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => classify(pair, "DISTINCT")}
                    >
                      Affaires distinctes
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => classify(pair, "UNCERTAIN")}
                    >
                      Incertain
                    </Button>
                    {pair.previousClassification === "LINKED" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => publishLink(pair, sides[0]!, sides[1]!)}
                      >
                        <Link2 className="mr-1 h-3 w-3" aria-hidden="true" />
                        Publier le lien
                      </Button>
                    )}
                    {busy && (
                      <Loader2 className="h-4 w-4 animate-spin self-center" aria-hidden="true" />
                    )}
                  </div>

                  {pair.previousClassification === "LINKED" && (
                    <p className="text-xs text-muted-foreground">
                      Le lien n&apos;est pas publié tant qu&apos;il n&apos;a pas été confirmé : il
                      apparaît sur les fiches publiées.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </section>
      ))}
    </div>
  );
}
