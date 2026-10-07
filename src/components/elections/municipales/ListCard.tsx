"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CandidateRow } from "@/components/elections/municipales/CandidateRow";
import { PoliticianBridge } from "@/components/elections/municipales/PoliticianBridge";

/**
 * Match a candidateName against an incumbent mayor's lastName,
 * handling double surnames (e.g. "Libert Albanel" matches "LIBERT").
 */
function matchesLastName(candidateName: string, lastName: string): boolean {
  const lower = candidateName.toLowerCase();
  if (lower.includes(lastName.toLowerCase())) return true;
  // Fallback: try primary surname for double surnames
  const parts = lastName.split(/\s+/);
  const primary = parts[0];
  if (parts.length > 1 && primary && primary.length > 2) {
    return lower.includes(primary.toLowerCase());
  }
  return false;
}

interface ListCardProps {
  name: string;
  partyLabel: string | null;
  candidateCount: number;
  femaleCount: number;
  teteDeListe: {
    candidateName: string;
    politician?: {
      slug: string;
      fullName: string;
    } | null;
  };
  members: Array<{
    id: string;
    candidateName: string;
    listPosition: number | null;
    candidate: { gender: string | null } | null;
    politician: {
      id: string;
      slug: string;
      fullName: string;
      photoUrl: string | null;
      blobPhotoUrl: string | null;
      currentParty: { shortName: string; color: string | null } | null;
      mandates: Array<{ type: string }>;
    } | null;
    participationRate?: number | null;
    affairsCount?: number;
  }>;
  incumbentMaireLastName?: string | null;
  incumbentMaireGender?: string | null;
  // Round 1 results (optional - only present after import)
  round1Pct?: number | null;
  round1Votes?: number | null;
  round1Qualified?: boolean | null;
  // Round 2 results (optional - only present after T2 import)
  round2Pct?: number | null;
  round2Votes?: number | null;
  isElected?: boolean;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("w-5 h-5 transition-transform duration-200", expanded && "rotate-180")}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ParityIndicator({ femaleCount, total }: { femaleCount: number; total: number }) {
  const rate = total > 0 ? femaleCount / total : 0;
  const isParityOk = rate >= 0.45;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        isParityOk ? "text-green-700" : "text-amber-600"
      )}
      title={`${Math.round(rate * 100)} % de femmes`}
    >
      {isParityOk ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4"
          aria-hidden="true"
        >
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      )}
      <span className="sr-only">{isParityOk ? "Parité respectée" : "Parité insuffisante"}</span>
    </span>
  );
}

export function ListCard({
  name,
  partyLabel,
  candidateCount,
  femaleCount,
  teteDeListe,
  members,
  incumbentMaireLastName,
  incumbentMaireGender,
  round1Pct,
  round1Votes,
  round1Qualified,
  round2Pct,
  round2Votes,
  isElected,
}: ListCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={isElected ? "border-green-300 dark:border-green-800" : undefined}>
      <CardContent className="pt-6">
        {/* Header — always visible */}
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="w-full text-left flex items-center gap-3"
          aria-expanded={expanded}
          aria-label={`Voir les candidats de la liste ${name}`}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-bold">{name}</span>
              {partyLabel && (
                <Badge variant="outline" className="shrink-0">
                  {partyLabel}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Tête de liste : {teteDeListe.candidateName}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-sm text-muted-foreground tabular-nums">
              {candidateCount} candidat{candidateCount > 1 ? "s" : ""}
            </span>
            <ParityIndicator femaleCount={femaleCount} total={candidateCount} />
            <ChevronIcon expanded={expanded} />
          </div>
        </button>

        {/* Round 1 results (shown when available) */}
        {round1Pct != null && (
          <div className="mt-3 bg-muted/30 rounded-lg p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">1er tour</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold tabular-nums">{round1Pct.toFixed(2)} %</span>
                  {round1Votes != null && (
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {round1Votes.toLocaleString("fr-FR")} voix
                    </span>
                  )}
                </div>
              </div>
              {isElected && round2Pct == null && (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 gap-1">
                  Élue
                </Badge>
              )}
              {!isElected && round1Qualified === true && round2Pct == null && (
                <Badge
                  className="text-sky-700 border-sky-300 dark:text-sky-400 dark:border-sky-800"
                  variant="outline"
                >
                  Qualifiée T2
                </Badge>
              )}
              {!isElected && round1Qualified === false && (
                <Badge variant="outline" className="text-muted-foreground">
                  Non qualifiée
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Round 2 results */}
        {round2Pct != null && (
          <div className="mt-2 bg-muted/30 rounded-lg p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">2nd tour</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold tabular-nums">{round2Pct.toFixed(2)} %</span>
                  {round2Votes != null && (
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {round2Votes.toLocaleString("fr-FR")} voix
                    </span>
                  )}
                </div>
              </div>
              {isElected && (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 gap-1">
                  Élue
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Expanded: full roster */}
        {expanded && (
          <div className="mt-4 border-t pt-3 space-y-0.5">
            {members.map((member) => (
              <div key={member.id}>
                <CandidateRow
                  position={member.listPosition}
                  name={member.candidateName}
                  gender={member.candidate?.gender ?? null}
                  politician={member.politician}
                  isIncumbentMaire={
                    !!incumbentMaireLastName &&
                    matchesLastName(member.candidateName, incumbentMaireLastName)
                  }
                  incumbentMaireGender={incumbentMaireGender}
                />
                {member.politician && (
                  <PoliticianBridge
                    politician={member.politician}
                    participationRate={member.participationRate}
                    affairsCount={member.affairsCount}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
