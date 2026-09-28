"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { matchesConstituency } from "@/lib/senatoriales/constituency-filter";
import type { ElectedSenator } from "@/lib/senatoriales/results-summary";
import { ElectedByConstituency } from "./ElectedByConstituency";

/**
 * The list of people elected, narrowed to the department the reader types. The server
 * renders every card (the query starts empty), so the list stays whole without JavaScript
 * and for a crawler.
 */
export function ElectedFilter({
  elected,
  outlines,
}: {
  elected: ElectedSenator[];
  outlines: Record<string, string>;
}) {
  const inputId = useId();
  const [query, setQuery] = useState("");

  const visible = elected.filter((person) =>
    matchesConstituency(query, { code: person.constituencyCode, name: person.constituencyName })
  );
  const total = new Set(elected.map((person) => person.constituencyCode)).size;
  const shown = new Set(visible.map((person) => person.constituencyCode)).size;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium">
          Chercher un département
        </label>
        <Input
          id={inputId}
          type="search"
          autoComplete="off"
          placeholder="Ariège, 09…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-11 max-w-sm"
        />
        <p aria-live="polite" className="mt-1.5 text-sm text-muted-foreground">
          {shown === total
            ? `${total} circonscriptions`
            : `${shown} ${shown > 1 ? "circonscriptions" : "circonscription"} sur ${total}`}
        </p>
      </div>
      {shown === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm">
          Aucune circonscription ne correspond à « {query.trim()} ». Essayez le nom du département
          ou son numéro.
        </p>
      ) : (
        <ElectedByConstituency elected={visible} outlines={outlines} />
      )}
    </div>
  );
}
