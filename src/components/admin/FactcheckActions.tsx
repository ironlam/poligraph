"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FACTCHECK_RATING_LABELS } from "@/config/labels";
import type { FactCheckRating } from "@/generated/prisma";

const RATING_OPTIONS: FactCheckRating[] = [
  "TRUE",
  "MOSTLY_TRUE",
  "HALF_TRUE",
  "MISLEADING",
  "OUT_OF_CONTEXT",
  "MOSTLY_FALSE",
  "FALSE",
  "UNVERIFIABLE",
];

const RATING_COLORS: Record<string, string> = {
  TRUE: "border-green-300 bg-green-50 text-green-700",
  MOSTLY_TRUE: "border-green-200 bg-green-50 text-green-600",
  HALF_TRUE: "border-amber-300 bg-amber-50 text-amber-700",
  MISLEADING: "border-orange-300 bg-orange-50 text-orange-700",
  OUT_OF_CONTEXT: "border-orange-300 bg-orange-50 text-orange-700",
  MOSTLY_FALSE: "border-red-200 bg-red-50 text-red-600",
  FALSE: "border-red-300 bg-red-50 text-red-700",
  UNVERIFIABLE: "border-gray-300 bg-gray-50 text-gray-600",
};

// -- Verdict select ----------------------------------------------------------

export function VerdictSelect({
  factcheckId,
  currentRating,
}: {
  factcheckId: string;
  currentRating: FactCheckRating;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <select
      value={currentRating}
      disabled={isPending}
      aria-label="Verdict"
      className={`h-7 rounded-md border px-1.5 text-xs font-medium cursor-pointer appearance-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${RATING_COLORS[currentRating]} ${isPending ? "opacity-50 cursor-wait" : ""}`}
      onChange={(e) => {
        const newRating = e.target.value as FactCheckRating;
        if (newRating === currentRating) return;
        startTransition(async () => {
          const res = await fetch(`/api/admin/factchecks/${factcheckId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ verdictRating: newRating }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            alert(data?.error || "Erreur");
            return;
          }
          router.refresh();
        });
      }}
    >
      {RATING_OPTIONS.map((r) => (
        <option key={r} value={r}>
          {FACTCHECK_RATING_LABELS[r]}
        </option>
      ))}
    </select>
  );
}

// -- Claimant toggle ---------------------------------------------------------

export function ClaimantToggle({
  mentionId,
  isClaimant,
}: {
  mentionId: string;
  isClaimant: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={isPending}
      aria-label={isClaimant ? "Retirer auteur" : "Marquer auteur"}
      title={isClaimant ? "Retirer le statut auteur" : "Marquer comme auteur"}
      className={`text-[10px] px-1.5 py-0.5 rounded-full transition-colors ${
        isClaimant
          ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
          : "bg-gray-100 text-gray-400 hover:bg-gray-200"
      } ${isPending ? "opacity-50 cursor-wait" : "cursor-pointer"}`}
      onClick={() => {
        startTransition(async () => {
          const res = await fetch(`/api/admin/factchecks/mentions/${mentionId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isClaimant: !isClaimant }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            alert(data?.error || "Erreur");
            return;
          }
          router.refresh();
        });
      }}
    >
      {isClaimant ? "auteur" : "auteur?"}
    </button>
  );
}

// -- Mention review ----------------------------------------------------------

/**
 * Validates a mention matched on a single word. Until then the mention counts for no indexation
 * signal (src/lib/factchecks/mention-review.ts). To reject it, "Délier" removes it and blocks the
 * pair for later syncs.
 */
export function MentionReviewButton({
  mentionId,
  matchedName,
  politicianName,
}: {
  mentionId: string;
  matchedName: string | null;
  politicianName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const word = matchedName?.trim() || "un nom inconnu";

  return (
    <button
      type="button"
      disabled={isPending}
      aria-label={`Valider le lien avec ${politicianName}, trouvé sur « ${word} » seul`}
      title={`Trouvé sur « ${word} » seul. Valider si le fact-check parle bien de ${politicianName}, sinon délier.`}
      className={`text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-800 hover:bg-orange-200 transition-colors ${
        isPending ? "opacity-50 cursor-wait" : "cursor-pointer"
      }`}
      onClick={() => {
        startTransition(async () => {
          const res = await fetch(`/api/admin/factchecks/mentions/${mentionId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reviewed: true }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            alert(data?.error || "Erreur");
            return;
          }
          router.refresh();
        });
      }}
    >
      « {word} » · valider
    </button>
  );
}

// -- Add mention -------------------------------------------------------------

interface SearchResult {
  id: string;
  fullName: string;
  slug: string;
  party: string | null;
}

export function AddMentionButton({ factcheckId }: { factcheckId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function search(q: string) {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const res = await fetch(`/api/search/politicians?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setResults(data);
  }

  function addMention(politicianId: string) {
    startTransition(async () => {
      const res = await fetch(`/api/admin/factchecks/${factcheckId}/mentions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ politicianId, isClaimant: false }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error || "Erreur");
        return;
      }
      setIsOpen(false);
      setQuery("");
      setResults([]);
      router.refresh();
    });
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="text-xs text-primary hover:underline"
      >
        + Ajouter
      </button>
    );
  }

  return (
    <div className="mt-1 relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          search(e.target.value);
        }}
        placeholder="Rechercher..."
        autoFocus
        className="w-full px-2 py-1 text-xs border border-border rounded bg-background"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setIsOpen(false);
            setQuery("");
            setResults([]);
          }
        }}
      />
      {results.length > 0 && (
        <div className="absolute z-10 top-full left-0 right-0 mt-0.5 bg-background border border-border rounded shadow-lg max-h-40 overflow-auto">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={isPending}
              className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted transition-colors"
              onClick={() => addMention(r.id)}
            >
              {r.fullName}
              {r.party && <span className="ml-1 text-muted-foreground">({r.party})</span>}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          setIsOpen(false);
          setQuery("");
          setResults([]);
        }}
        className="absolute right-1 top-0.5 text-xs text-muted-foreground hover:text-foreground"
        aria-label="Fermer"
      >
        x
      </button>
    </div>
  );
}
