"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Download, ExternalLink, Loader2, Search, Unlink } from "lucide-react";

/**
 * Manage the links between an affair and existing court decisions (#536).
 *
 * Links only. Nothing here creates or deletes a decision. A linked decision can be
 * refreshed from Judilibre (#337): that rewrites the decision's own official fields,
 * never the affair. A search by pourvoi number always shows every candidate, because
 * a pourvoi can produce several decisions.
 */

interface DecisionSummary {
  id: string;
  ecli: string | null;
  pourvoiNumber: string | null;
  court: string | null;
  chamber: string | null;
  decisionDate: string | null;
  solution: string | null;
  sourceUrl: string | null;
  linkedAffairCount?: number;
}

interface LinkedDecision extends DecisionSummary {
  linkNotes: string | null;
}

interface Props {
  affairId: string;
  initialLinks: LinkedDecision[];
}

function DecisionFields({ decision }: { decision: DecisionSummary }) {
  const rows: Array<[string, string | null]> = [
    ["ECLI", decision.ecli],
    ["N° de pourvoi", decision.pourvoiNumber],
    ["Juridiction", decision.court],
    ["Chambre", decision.chamber],
    ["Date", decision.decisionDate ? decision.decisionDate.slice(0, 10) : null],
    ["Sens", decision.solution],
  ];
  const filled = rows.filter(([, value]) => value);

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      {filled.length === 0 && (
        <div className="col-span-2 text-muted-foreground">Aucune référence publique renseignée</div>
      )}
      {filled.map(([label, value]) => (
        <div key={label} className="flex gap-2">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-mono text-xs break-all">{value}</dd>
        </div>
      ))}
      {decision.sourceUrl && (
        <div className="col-span-2">
          <a
            href={decision.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline underline-offset-4"
          >
            Consulter la source officielle
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>
      )}
    </dl>
  );
}

export function CourtDecisionLinks({ affairId, initialLinks }: Props) {
  const [links, setLinks] = useState<LinkedDecision[]>(initialLinks);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<DecisionSummary[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>(
    Object.fromEntries(initialLinks.map((l) => [l.id, l.linkNotes ?? ""]))
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    setLinks(initialLinks);
  }, [initialLinks]);

  const call = useCallback(async (url: string, init: RequestInit, key: string) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "content-type": "application/json", ...(init.headers ?? {}) },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? `Échec (${res.status})`);
      }
      return await res.json();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      return null;
    } finally {
      setBusy(null);
    }
  }, []);

  const search = useCallback(async () => {
    if (term.trim().length < 2) {
      setError("Saisissez au moins deux caractères");
      return;
    }
    const data = await call(
      `/api/admin/court-decisions/search?q=${encodeURIComponent(term.trim())}`,
      { method: "GET" },
      "search"
    );
    if (data) setResults(data.results ?? []);
  }, [call, term]);

  const link = useCallback(
    async (decision: DecisionSummary) => {
      const data = await call(
        `/api/admin/affaires/${affairId}/decisions`,
        { method: "POST", body: JSON.stringify({ courtDecisionId: decision.id }) },
        decision.id
      );
      if (!data) return;
      if (data.created) {
        setLinks((prev) => [...prev, { ...decision, linkNotes: null }]);
      } else {
        setError("Cette décision est déjà liée à l'affaire");
      }
    },
    [affairId, call]
  );

  const saveNote = useCallback(
    async (decisionId: string) => {
      const value = notes[decisionId] ?? "";
      const data = await call(
        `/api/admin/affaires/${affairId}/decisions`,
        {
          method: "PATCH",
          body: JSON.stringify({ courtDecisionId: decisionId, notes: value || null }),
        },
        decisionId
      );
      if (!data) return;
      setLinks((prev) =>
        prev.map((l) => (l.id === decisionId ? { ...l, linkNotes: value || null } : l))
      );
    },
    [affairId, call, notes]
  );

  const unlink = useCallback(
    async (decision: LinkedDecision) => {
      const reference = decision.pourvoiNumber ?? decision.ecli ?? "sans référence publique";
      const confirmed = window.confirm(
        `Retirer la liaison vers la décision « ${reference} » ?\n\n` +
          `La décision elle-même n'est pas supprimée : seule la liaison avec cette affaire ` +
          `disparaît.`
      );
      if (!confirmed) return;

      const data = await call(
        `/api/admin/affaires/${affairId}/decisions`,
        {
          method: "DELETE",
          body: JSON.stringify({ courtDecisionId: decision.id, confirmed: true }),
        },
        decision.id
      );
      if (!data) return;
      setLinks((prev) => prev.filter((l) => l.id !== decision.id));
    },
    [affairId, call]
  );

  const enrich = useCallback(
    async (decision: LinkedDecision) => {
      const reference = decision.ecli ?? decision.pourvoiNumber;
      if (!reference) {
        setError("Cette décision n'a aucune référence à interroger.");
        return;
      }
      const confirmed = window.confirm(
        `Récupérer « ${reference} » depuis Judilibre ?\n\n` +
          `Les champs officiels de la décision (juridiction, chambre, date, sens, ECLI) ` +
          `seront écrits depuis la réponse de l'API et deviendront visibles sur la fiche ` +
          `publique. L'affaire elle-même n'est pas modifiée.`
      );
      if (!confirmed) return;

      setNotice(null);
      const body = decision.ecli
        ? { ecli: decision.ecli, confirmed: true }
        : { pourvoiNumber: decision.pourvoiNumber, confirmed: true };
      const data = await call(
        `/api/admin/court-decisions/${decision.id}/enrich`,
        { method: "POST", body: JSON.stringify(body) },
        decision.id
      );
      if (!data) return;

      if (data.status === "UNCHANGED") {
        setNotice("Déjà à jour : la réponse officielle est identique à ce qui est enregistré.");
        return;
      }
      const count = Array.isArray(data.changes) ? data.changes.length : 0;
      setNotice(`${count} champ(s) mis à jour depuis Judilibre.`);
      router.refresh();
    },
    [call, router]
  );

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-medium">Décisions de justice rattachées</h2>
        <p className="text-sm text-muted-foreground">
          Une décision peut porter plusieurs chefs, donc concerner plusieurs fiches. Lier une
          décision ne fusionne jamais deux affaires.
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <p role="status" className="rounded-md border bg-muted/40 p-3 text-sm">
          {notice}
        </p>
      )}

      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucune décision rattachée. C&apos;est un état normal : une enquête en cours ou une action
          du parquet ne produit pas de décision.
        </p>
      ) : (
        <ul className="space-y-4">
          {links.map((decision) => (
            <li key={decision.id} className="rounded-md border p-3">
              <DecisionFields decision={decision} />
              <div className="mt-3 space-y-2">
                <label htmlFor={`note-${decision.id}`} className="text-xs text-muted-foreground">
                  Note de liaison
                </label>
                <Textarea
                  id={`note-${decision.id}`}
                  rows={2}
                  value={notes[decision.id] ?? ""}
                  onChange={(e) => setNotes((p) => ({ ...p, [decision.id]: e.target.value }))}
                  placeholder="Ex. deux chefs d'un même arrêt"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy === decision.id}
                    onClick={() => saveNote(decision.id)}
                  >
                    Enregistrer la note
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy === decision.id || !(decision.ecli || decision.pourvoiNumber)}
                    onClick={() => enrich(decision)}
                    title={
                      decision.ecli || decision.pourvoiNumber
                        ? undefined
                        : "Aucune référence à interroger"
                    }
                  >
                    <Download className="mr-1 h-3 w-3" aria-hidden="true" />
                    Enrichir depuis Judilibre
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === decision.id}
                    onClick={() => unlink(decision)}
                  >
                    <Unlink className="mr-1 h-3 w-3" aria-hidden="true" />
                    Retirer la liaison
                  </Button>
                  {busy === decision.id && (
                    <Loader2 className="h-4 w-4 animate-spin self-center" aria-hidden="true" />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 border-t pt-4">
        <label htmlFor="decision-search" className="text-sm font-medium">
          Lier une décision existante
        </label>
        <div className="flex gap-2">
          <Input
            id="decision-search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="ECLI, identifiant Judilibre, ou n° de pourvoi"
          />
          <Button size="sm" disabled={busy === "search"} onClick={search}>
            <Search className="mr-1 h-3 w-3" aria-hidden="true" />
            Rechercher
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Une recherche par pourvoi rend toujours une liste : un même pourvoi peut produire
          plusieurs décisions.
        </p>

        {results !== null && results.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aucune décision existante ne correspond. La création d&apos;une décision n&apos;est pas
            encore possible depuis cette interface.
          </p>
        )}

        {results !== null && results.length > 0 && (
          <ul className="space-y-2">
            {results.map((decision) => {
              const alreadyLinked = links.some((l) => l.id === decision.id);
              return (
                <li
                  key={decision.id}
                  className="flex items-start justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <DecisionFields decision={decision} />
                    {typeof decision.linkedAffairCount === "number" && (
                      <Badge variant="outline" className="mt-2">
                        {decision.linkedAffairCount} affaire
                        {decision.linkedAffairCount > 1 ? "s" : ""} liée
                        {decision.linkedAffairCount > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                  <Button
                    size="sm"
                    disabled={alreadyLinked || busy === decision.id}
                    onClick={() => link(decision)}
                  >
                    {alreadyLinked ? "Déjà liée" : "Lier"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
