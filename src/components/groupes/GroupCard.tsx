import Link from "next/link";
import { ROUTES } from "@/config/routes";
import { getAccessibleTextColor } from "@/lib/contrast";
import type { GroupListingItem } from "@/lib/data/groupes";
import { GovernmentProjectPositionBreakdown } from "./GovernmentProjectPositionBreakdown";

interface GroupCardProps {
  group: GroupListingItem;
  /** Seats held by every listed group of the same chamber, for the share shown under the name. */
  chamberSeats?: number;
}

const NEUTRAL_GROUP_COLOR = "#a6a6a6";

export function formatSeatShare(seats: number, total: number): string {
  const share = Math.round((seats / total) * 1000) / 10;
  return `${share.toLocaleString("fr-FR")} %`;
}

/** The group's code on its own colour, the visual signature reused on the group pages. */
export function GroupMonogram({
  code,
  color,
  className,
}: {
  code: string;
  color: string | null;
  className?: string;
}) {
  const background = color ?? NEUTRAL_GROUP_COLOR;
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center font-display font-extrabold ${className ?? "h-9 min-w-13 rounded-lg px-2 text-sm"}`}
      style={{ backgroundColor: background, color: getAccessibleTextColor(background) }}
    >
      {code}
    </span>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  const rounded = Math.round(value);
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex justify-between text-sm text-muted-foreground">
        <span>{label}</span>
        <span className="text-base font-bold text-foreground">{rounded} %</span>
      </p>
      <span aria-hidden="true" className="flex h-1.5 overflow-hidden rounded-full bg-muted">
        <span className="bg-primary" style={{ width: `${rounded}%` }} />
      </span>
    </div>
  );
}

export function GroupCard({ group, chamberSeats }: GroupCardProps) {
  const href = group.slug ? ROUTES.groupeDetail(group.slug) : "#";
  const noun = group.chamber === "AN" ? "député" : "sénateur";
  const seats = `${group.seatCount} ${noun}${group.seatCount > 1 ? "s" : ""}`;

  return (
    <Link
      href={href}
      prefetch={false}
      className="group flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span
        aria-hidden="true"
        className="h-1.5"
        style={{ backgroundColor: group.color ?? NEUTRAL_GROUP_COLOR }}
      />
      <div className="flex grow flex-col gap-4 p-5">
        <span className="flex items-center gap-3">
          <GroupMonogram code={group.code} color={group.color} />
          <span className="flex min-w-0 flex-col">
            <span className="font-display text-base font-bold leading-snug group-hover:underline">
              {group.name}
            </span>
            <span className="text-sm text-muted-foreground">
              {seats}
              {chamberSeats
                ? ` · ${formatSeatShare(group.seatCount, chamberSeats)} des sièges`
                : ""}
            </span>
          </span>
        </span>

        {group.chamber === "SENAT" && group.stats && (
          <div className="mt-auto grid grid-cols-2 gap-4">
            <Meter label="Cohésion" value={group.stats.cohesionPct} />
            <Meter label="Concordance" value={group.stats.governmentAlignmentPct} />
          </div>
        )}

        {group.chamber === "AN" && (
          <div className="mt-auto">
            {group.code === "NI" ? (
              <span className="block rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
                Non calculé pour les non-inscrits, qui ne forment pas un groupe.
              </span>
            ) : group.governmentProjectPositions ? (
              <GovernmentProjectPositionBreakdown
                summary={group.governmentProjectPositions}
                compact
              />
            ) : (
              <span className="block text-sm text-muted-foreground">Données indisponibles</span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
