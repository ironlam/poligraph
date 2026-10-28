"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CHANGELOG_TYPE_LABELS } from "@/config/labels";
import { formatChangelogDay, type PublicChangelogEntry } from "@/lib/changelog/format";

type Filter = "ALL" | PublicChangelogEntry["type"];

const FILTERS: { value: Filter; label: string }[] = [
  { value: "ALL", label: "Tout" },
  { value: "NOUVEAUTE", label: "Nouveautés" },
  { value: "AMELIORATION", label: "Améliorations" },
  { value: "CORRECTION", label: "Corrections" },
  { value: "DONNEES", label: "Données" },
];

export function ChangelogList({ entries }: { entries: PublicChangelogEntry[] }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const shown = filter === "ALL" ? entries : entries.filter((entry) => entry.type === filter);

  return (
    <div className="space-y-6">
      <div
        role="group"
        aria-label="Filtrer par type de changement"
        className="flex flex-wrap gap-2"
      >
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={filter === item.value}
            onClick={() => setFilter(item.value)}
            className="min-h-11 rounded-full border border-primary px-4 text-sm font-bold aria-pressed:bg-primary aria-pressed:text-primary-foreground text-primary bg-card hover:bg-accent aria-pressed:hover:bg-primary"
          >
            {item.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucune entrée de ce type dans le journal pour le moment.
        </p>
      ) : (
        <ul className="space-y-4">
          {shown.map((entry) => (
            <li key={entry.id} id={entry.id} className="flex flex-wrap gap-x-6 gap-y-2">
              <time
                dateTime={entry.date}
                className="basis-36 shrink-0 pt-5 font-display font-bold text-primary"
              >
                {formatChangelogDay(entry.date)}
              </time>
              <Card className="min-w-0 flex-1 basis-80">
                <CardContent className="space-y-2 p-5">
                  <span className="inline-flex min-h-6 items-center rounded-full border border-primary px-2.5 text-xs font-bold text-primary">
                    {CHANGELOG_TYPE_LABELS[entry.type]}
                  </span>
                  <h2 className="font-display text-xl font-bold">{entry.title}</h2>
                  <p className="text-sm">{entry.body}</p>
                  {entry.sourceUrl && (
                    <a
                      href={entry.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Source de l'entrée : ${entry.title} (nouvel onglet)`}
                      className="inline-flex min-h-11 items-center gap-1.5 text-xs text-muted-foreground-strong hover:underline"
                    >
                      Source
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
