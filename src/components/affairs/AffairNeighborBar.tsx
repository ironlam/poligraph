"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, User } from "lucide-react";
import type { AffairNeighbors } from "@/lib/affairs/neighbors";

/**
 * Prev/next within the reader's listing perimeter, plus a mobile bottom action
 * bar whose primary action is the politician's fiche. Neighbours are fetched
 * client-side from /api/affaires/neighbors using the filters carried in
 * `?retour=`, so the detail page stays static (ISR) and no perimeter is baked
 * into the cached HTML. Without `?retour=` (a direct visit) there is no
 * perimeter, so no prev/next is shown.
 */
interface AffairNeighborBarProps {
  slug: string;
  politicianSlug: string;
}

export function AffairNeighborBar({ slug, politicianSlug }: AffairNeighborBarProps) {
  const searchParams = useSearchParams();
  const retour = searchParams.get("retour");
  const rn = searchParams.get("rn");
  const [neighbors, setNeighbors] = useState<AffairNeighbors | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!retour) return;
    const query = new URLSearchParams(retour);
    query.set("slug", slug);
    const controller = new AbortController();
    fetch(`/api/affaires/neighbors?${query.toString()}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setNeighbors(data))
      .catch(() => {
        /* aborted or offline: no neighbour nav, not a page error */
      });
    return () => controller.abort();
  }, [retour, slug]);

  // Collapse the mobile bar on downward scroll, reveal on upward — it never sits
  // above the status notice (which lives at the top of the page).
  const lastY = useRef(0);
  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      if (Math.abs(y - lastY.current) > 8) {
        setHidden(y > lastY.current && y > 200);
        lastY.current = y;
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Gate on the perimeter at render time: if `?retour=` is gone (navigated to an
  // affair reached without a listing), show no prev/next even if stale state
  // lingers on a persisted instance.
  const hasPerimeter = Boolean(retour);
  const prev = hasPerimeter ? (neighbors?.prev ?? null) : null;
  const next = hasPerimeter ? (neighbors?.next ?? null) : null;
  const position = hasPerimeter ? (neighbors?.position ?? null) : null;
  const total = hasPerimeter ? (neighbors?.total ?? 0) : 0;

  function neighborHref(target: string) {
    const sp = new URLSearchParams();
    if (retour) sp.set("retour", retour);
    if (rn) sp.set("rn", rn);
    const qs = sp.toString();
    return `/affaires/${target}${qs ? `?${qs}` : ""}`;
  }

  const ficheHref = `/politiques/${politicianSlug}`;

  return (
    <>
      {/* Desktop: prev/next by title, in the reading flow after "Poursuivre". */}
      {(prev || next) && (
        <nav
          aria-label="Navigation entre affaires"
          className="mt-4 hidden gap-3 sm:grid sm:grid-cols-2"
        >
          {prev ? (
            <Link
              href={neighborHref(prev.slug)}
              className="group flex min-h-11 items-center gap-2 rounded-xl border bg-card p-3 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ArrowLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-xs text-muted-foreground">Affaire précédente</span>
                <span className="block truncate font-medium">{prev.title}</span>
              </span>
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
          {next ? (
            <Link
              href={neighborHref(next.slug)}
              className="group flex min-h-11 items-center justify-end gap-2 rounded-xl border bg-card p-3 text-right outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="min-w-0">
                <span className="block text-xs text-muted-foreground">Affaire suivante</span>
                <span className="block truncate font-medium">{next.title}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
        </nav>
      )}
      {position !== null && total > 1 && (
        <p className="mt-2 hidden text-center text-xs text-muted-foreground sm:block">
          Affaire {position.toLocaleString("fr-FR")} sur {total.toLocaleString("fr-FR")} dans ce
          périmètre
        </p>
      )}

      {/* Mobile: fixed bottom action bar, thumb zone, safe-area aware. */}
      <div
        className={`fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur-sm transition-transform duration-200 motion-reduce:transition-none sm:hidden ${
          hidden ? "translate-y-full" : "translate-y-0"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          {prev ? (
            <Link
              href={neighborHref(prev.slug)}
              aria-label={`Affaire précédente : ${prev.title}`}
              className="grid min-h-11 min-w-11 place-items-center rounded-md border outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="size-5" aria-hidden="true" />
            </Link>
          ) : (
            <span className="min-h-11 min-w-11" aria-hidden="true" />
          )}

          <Link
            href={ficheHref}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            <User className="size-4 shrink-0" aria-hidden="true" />
            Fiche complète
          </Link>

          {next ? (
            <Link
              href={neighborHref(next.slug)}
              aria-label={`Affaire suivante : ${next.title}`}
              className="grid min-h-11 min-w-11 place-items-center rounded-md border outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowRight className="size-5" aria-hidden="true" />
            </Link>
          ) : (
            <span className="min-h-11 min-w-11" aria-hidden="true" />
          )}
        </div>
      </div>
    </>
  );
}
