"use client";

import { useCallback, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, ExternalLink, Loader2 } from "lucide-react";
import { AMENDMENT_STATUS_LABELS, AMENDMENT_STATUS_COLORS } from "@/config/labels";
import type { AmendmentStatus } from "@/generated/prisma";
import type {
  AmendmentFilter,
  AmendmentStats,
  CuratedAmendment,
  CuratedAmendmentsPage,
} from "@/lib/data/dossier-amendments";

interface FilterState {
  items: CuratedAmendment[];
  page: number;
  total: number;
  hasMore: boolean;
  capped: boolean;
}

const FILTER_LABELS: Record<AmendmentFilter, string> = {
  adopted: "Adoptés",
  rejected: "Rejetés",
  "with-content": "Tous les amendements utiles",
};

// Grammatically correct empty-state per filter (the button labels don't compose
// into a clean sentence).
const FILTER_EMPTY: Record<AmendmentFilter, string> = {
  adopted: "Aucun amendement adopté avec contenu exploitable.",
  rejected: "Aucun amendement rejeté avec contenu exploitable.",
  "with-content": "Aucun amendement avec contenu exploitable.",
};

// Stats line order (most meaningful first). AMENDMENT_STATUS_LABELS is singular,
// so the count line needs its own plurals.
const STAT_ORDER: AmendmentStatus[] = ["ADOPTE", "REJETE", "TOMBE", "DEPOSE", "RETIRE"];
const STAT_PLURAL: Record<AmendmentStatus, string> = {
  ADOPTE: "adoptés",
  REJETE: "rejetés",
  TOMBE: "tombés",
  DEPOSE: "déposés",
  RETIRE: "retirés",
};

interface Props {
  dossierId: string;
  stats: AmendmentStats;
  sourceUrl: string | null;
  /** Server-rendered first page (default "adopted" filter) for SEO and no-JS. */
  initial: CuratedAmendmentsPage;
}

export function DossierAmendments({ dossierId, stats, sourceUrl, initial }: Props) {
  const [filter, setFilter] = useState<AmendmentFilter>(initial.filter);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // Per-filter cache so switching tabs (or back) doesn't refetch.
  const cache = useRef<Map<AmendmentFilter, FilterState>>(
    new Map([
      [
        initial.filter,
        {
          items: initial.items,
          page: 1,
          total: initial.total,
          hasMore: initial.hasMore,
          capped: initial.capped,
        },
      ],
    ])
  );
  const [, forceRender] = useState(0);
  const rerender = () => forceRender((n) => n + 1);

  // eslint-disable-next-line react-hooks/refs -- cache par filtre, rerender() forcé après chaque écriture
  const current = cache.current.get(filter);

  const load = useCallback(
    async (f: AmendmentFilter, page: number) => {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(`/api/dossiers/${dossierId}/amendments?filter=${f}&page=${page}`);
        if (!res.ok) throw new Error(String(res.status));
        const data: CuratedAmendmentsPage = await res.json();
        const prev = cache.current.get(f);
        cache.current.set(f, {
          items: page <= 1 ? data.items : [...(prev?.items ?? []), ...data.items],
          page,
          total: data.total,
          hasMore: data.hasMore,
          capped: data.capped,
        });
        rerender();
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [dossierId]
  );

  const selectFilter = (f: AmendmentFilter) => {
    setFilter(f);
    setError(false);
    if (!cache.current.has(f)) void load(f, 1);
  };

  const loadMore = () => {
    if (current) void load(filter, current.page + 1);
  };

  const statsLine = STAT_ORDER.filter((s) => stats.byStatus[s] > 0)
    .map((s) => `${stats.byStatus[s].toLocaleString("fr-FR")} ${STAT_PLURAL[s]}`)
    .join(" · ");

  const filterCount: Partial<Record<AmendmentFilter, number>> = {
    adopted: stats.byStatus.ADOPTE,
    rejected: stats.byStatus.REJETE,
  };

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Amendements ({stats.total.toLocaleString("fr-FR")})
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">{statsLine}</p>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline inline-flex items-center gap-1 mt-1 w-fit"
          >
            Liste exhaustive sur AN.fr
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div
          className="flex flex-wrap gap-2 mb-4"
          role="group"
          aria-label="Filtrer les amendements"
        >
          {(Object.keys(FILTER_LABELS) as AmendmentFilter[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => selectFilter(f)}
              aria-pressed={filter === f}
            >
              {FILTER_LABELS[f]}
              {filterCount[f] !== undefined && ` (${filterCount[f]!.toLocaleString("fr-FR")})`}
            </Button>
          ))}
        </div>

        {/* List */}
        {current && current.items.length > 0 ? (
          <div className="space-y-3">
            {current.items.map((a) => (
              <div key={a.id} className="py-3 border-b last:border-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant="outline" className="font-mono">
                    N° {a.number}
                  </Badge>
                  <Badge className={AMENDMENT_STATUS_COLORS[a.status]}>
                    {AMENDMENT_STATUS_LABELS[a.status]}
                  </Badge>
                  {a.articleLabel && (
                    <span className="text-sm text-muted-foreground">{a.articleLabel}</span>
                  )}
                </div>
                {a.authorName && (
                  <p className="text-sm text-muted-foreground">
                    Par {a.authorName}
                    {a.authorType && ` (${a.authorType})`}
                  </p>
                )}
                {a.excerpt && <p className="text-sm mt-2">{a.excerpt}</p>}
              </div>
            ))}
          </div>
        ) : (
          !loading &&
          !error && <p className="text-sm text-muted-foreground py-4">{FILTER_EMPTY[filter]}</p>
        )}

        {/* Loading / error / pagination */}
        {error && (
          <div className="text-sm text-muted-foreground py-4">
            Le chargement a échoué.{" "}
            <button
              type="button"
              onClick={() => load(filter, current?.page ?? 1)}
              className="text-primary hover:underline"
            >
              Réessayer
            </button>
          </div>
        )}

        {current?.hasMore && (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" size="sm" onClick={loadMore} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Voir plus
            </Button>
          </div>
        )}

        {loading && !current?.items.length && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Cap reached: the list is deliberately bounded, point readers to AN.fr. */}
        {filter === "with-content" && current?.capped && !current.hasMore && (
          <p className="text-sm text-muted-foreground mt-4 text-center">
            La liste affichée est volontairement limitée pour rester lisible. Pour consulter tous
            les amendements,{" "}
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                voir AN.fr
              </a>
            ) : (
              "voir AN.fr"
            )}
            .
          </p>
        )}
      </CardContent>
    </Card>
  );
}
