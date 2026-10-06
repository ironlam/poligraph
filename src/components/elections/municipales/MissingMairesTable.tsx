"use client";

import Link from "next/link";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";

interface MissingMaire {
  id: string;
  slug: string;
  fullName: string;
  photoUrl: string | null;
  blobPhotoUrl: string | null;
  partyShortName: string | null;
  partyColor: string | null;
  mandateStartDate: string | null;
}

interface MissingMairesTableProps {
  maires: MissingMaire[];
}

function formatYear(dateStr: string | null): string {
  if (!dateStr) return "—";
  // dateStr is ISO date as text, e.g. "2020-06-28" or "2020-06-28 00:00:00"
  const year = dateStr.slice(0, 4);
  return year;
}

export function MissingMairesTable({ maires }: MissingMairesTableProps) {
  if (maires.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-8">
        Tous les maires en exercice se sont représentés.
      </p>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Maires sortants absents des listes</caption>
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="py-3 px-2 font-medium">
                Nom
              </th>
              <th scope="col" className="py-3 px-2 font-medium">
                Parti
              </th>
              <th scope="col" className="py-3 px-2 font-medium">
                Maire depuis
              </th>
            </tr>
          </thead>
          <tbody>
            {maires.map((m) => (
              <tr
                key={m.id}
                className="border-b last:border-0 hover:bg-accent/50 transition-colors"
              >
                <td className="py-3 px-2">
                  <div className="flex items-center gap-2">
                    <PoliticianAvatar
                      photoUrl={m.photoUrl}
                      blobPhotoUrl={m.blobPhotoUrl}
                      fullName={m.fullName}
                      size="sm"
                      className="w-8 h-8 text-xs"
                    />
                    <Link
                      href={`/politiques/${m.slug}`}
                      prefetch={false}
                      className="font-medium hover:text-primary transition-colors"
                    >
                      {m.fullName}
                    </Link>
                  </div>
                </td>
                <td className="py-3 px-2">
                  {m.partyShortName ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: m.partyColor || "#9ca3af",
                        }}
                        aria-hidden="true"
                      />
                      {m.partyShortName}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-3 px-2 tabular-nums">{formatYear(m.mandateStartDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card layout */}
      <div className="md:hidden space-y-3">
        {maires.map((m) => (
          <div key={m.id} className="border rounded-lg p-3 flex items-center gap-3">
            <PoliticianAvatar
              photoUrl={m.photoUrl}
              blobPhotoUrl={m.blobPhotoUrl}
              fullName={m.fullName}
              size="sm"
              className="w-8 h-8 text-xs"
            />
            <div className="min-w-0 flex-1">
              <Link
                href={`/politiques/${m.slug}`}
                prefetch={false}
                className="font-medium hover:text-primary transition-colors block"
              >
                {m.fullName}
              </Link>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {m.partyShortName && (
                  <span className="inline-flex items-center gap-1">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: m.partyColor || "#9ca3af",
                      }}
                      aria-hidden="true"
                    />
                    {m.partyShortName}
                  </span>
                )}
                <span>Maire depuis {formatYear(m.mandateStartDate)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
