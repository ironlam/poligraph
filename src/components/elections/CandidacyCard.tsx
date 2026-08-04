import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PoligraphBadge } from "@/components/elections/PoligraphBadge";
import { CANDIDACY_STATUS_LABELS } from "@/config/labels";
import type { CandidacyStatus } from "@/generated/prisma";

export interface CandidacyCardData {
  id: string;
  candidateName: string;
  partyLabel: string | null;
  constituencyName: string | null;
  isElected: boolean;
  round1Pct: number | null;
  round2Pct: number | null;
  status: CandidacyStatus | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  politician: { slug: string } | null;
  party: { color: string | null } | null;
}

export function CandidacyCard({ candidacy }: { candidacy: CandidacyCardData }) {
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-3">
          {candidacy.party?.color && (
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: candidacy.party.color }}
              aria-hidden="true"
            />
          )}
          <div className="min-w-0">
            <p className="font-medium">
              {candidacy.politician ? (
                <Link
                  href={`/politiques/${candidacy.politician.slug}`}
                  className="hover:text-primary transition-colors"
                  prefetch={false}
                >
                  {candidacy.candidateName}
                </Link>
              ) : (
                candidacy.candidateName
              )}
            </p>
            {candidacy.status && (
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <Badge variant="outline" className="text-xs font-normal">
                  {CANDIDACY_STATUS_LABELS[candidacy.status]}
                </Badge>
                {candidacy.sourceUrl && candidacy.sourceLabel && (
                  <a
                    href={candidacy.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground underline hover:text-primary"
                  >
                    {candidacy.sourceLabel}
                  </a>
                )}
              </p>
            )}
            {candidacy.partyLabel && (
              <p className="text-sm text-muted-foreground">{candidacy.partyLabel}</p>
            )}
            {candidacy.constituencyName && (
              <p className="text-xs text-muted-foreground">{candidacy.constituencyName}</p>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {(candidacy.round1Pct != null || candidacy.round2Pct != null) && (
              <div className="text-right text-xs">
                {candidacy.round1Pct != null && (
                  <div className="font-semibold tabular-nums">
                    T1 : {candidacy.round1Pct.toFixed(2)}%
                  </div>
                )}
                {candidacy.round2Pct != null && (
                  <div className="text-muted-foreground tabular-nums">
                    T2 : {candidacy.round2Pct.toFixed(2)}%
                  </div>
                )}
              </div>
            )}
            {candidacy.politician && <PoligraphBadge />}
            {candidacy.isElected && <Badge className="bg-green-100 text-green-800">Élu(e)</Badge>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
