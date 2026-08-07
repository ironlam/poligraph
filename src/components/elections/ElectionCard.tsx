import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import {
  ELECTION_TYPE_ICONS,
  ELECTION_STATUS_LABELS,
  ELECTION_STATUS_COLORS,
  ELECTION_SCOPE_LABELS,
  SUFFRAGE_TYPE_LABELS,
} from "@/config/labels";
import { AddToCalendar } from "./AddToCalendar";
import type { ElectionType, ElectionStatus, ElectionScope, SuffrageType } from "@/types";

interface ElectionCardProps {
  slug: string;
  type: ElectionType;
  title: string;
  shortTitle: string | null;
  round1Date: Date | null;
  round2Date: Date | null;
  scope: ElectionScope;
  totalSeats: number | null;
  suffrage: SuffrageType;
  status: ElectionStatus;
  dateConfirmed: boolean;
  description: string | null;
}

export function ElectionCard({
  slug,
  type,
  title,
  round1Date,
  round2Date,
  scope,
  totalSeats,
  suffrage,
  status,
  dateConfirmed,
  description,
}: ElectionCardProps) {
  const icon = ELECTION_TYPE_ICONS[type];
  const statusColor = ELECTION_STATUS_COLORS[status];

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent>
        {/* Header */}
        <div className="flex flex-wrap items-start gap-2 mb-2">
          <span className="text-xl" aria-hidden="true">
            {icon}
          </span>
          <div className="flex-1 min-w-0">
            <Link
              href={`/elections/${slug}`}
              className="text-lg font-semibold hover:text-primary transition-colors line-clamp-1"
            >
              {title}
            </Link>
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <Badge className={statusColor}>{ELECTION_STATUS_LABELS[status]}</Badge>
          <Badge variant="outline">{ELECTION_SCOPE_LABELS[scope]}</Badge>
          <Badge variant="outline">{SUFFRAGE_TYPE_LABELS[suffrage]}</Badge>
        </div>

        {/* Description */}
        {description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{description}</p>
        )}

        {/* Footer */}
        <div className="border-t pt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {round1Date ? (
            <span className="inline-flex items-center gap-1.5">
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              {formatDate(round1Date)}
              {round2Date && <> / {formatDate(round2Date)}</>}
              {!dateConfirmed && <span className="text-xs italic">(provisoire)</span>}
            </span>
          ) : (
            <span className="text-xs italic">Dates à confirmer</span>
          )}
          {totalSeats && (
            <span className="inline-flex items-center gap-1.5">
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
              {totalSeats} sièges
            </span>
          )}
          {round1Date && status !== "COMPLETED" && (
            <AddToCalendar
              title={title}
              round1Date={round1Date}
              round2Date={round2Date}
              slug={slug}
              dateConfirmed={dateConfirmed}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
