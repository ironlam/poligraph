"use client";

import { useId, useState } from "react";

export interface CandidatFiltrable {
  cle: string;
  /** Name as published, the only text the filter reads. */
  nom: string;
  /** The line, rendered on the server. */
  ligne: React.ReactNode;
}

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * List of candidates with a name filter. Every line stays in the server HTML, in the order given:
 * the first ones are shown, the others are hidden until a name is typed or the whole list is
 * asked for. The filter never reorders.
 */
export function CandidatsFiltrables({
  candidats,
  visibles = 10,
}: {
  candidats: CandidatFiltrable[];
  visibles?: number;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [tous, setTous] = useState(false);
  const needle = fold(query);
  const shown = candidats.map((candidat, index) =>
    needle ? fold(candidat.nom).includes(needle) : tous || index < visibles
  );
  const count = shown.filter(Boolean).length;

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={id} className="block text-sm font-semibold">
          Filtrer par nom
        </label>
        <input
          id={id}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
          className="mt-1 min-h-11 w-full rounded-lg border bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
      </div>
      <p aria-live="polite" className="text-xs text-muted-foreground">
        {needle
          ? count
            ? `${count} sur ${candidats.length} candidats`
            : "Aucun candidat de la liste ne correspond à cette recherche."
          : `${count} sur ${candidats.length} candidats affichés`}
      </p>
      <ul className="space-y-2">
        {candidats.map((candidat, index) => (
          <li key={candidat.cle} hidden={!shown[index]}>
            {candidat.ligne}
          </li>
        ))}
      </ul>
      {!needle && candidats.length > visibles && (
        <button
          type="button"
          onClick={() => setTous(!tous)}
          aria-expanded={tous}
          className="min-h-11 rounded-lg border px-4 text-sm font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {tous
            ? `Afficher les ${visibles} premiers`
            : `Afficher les ${candidats.length} candidats`}
        </button>
      )}
    </div>
  );
}
